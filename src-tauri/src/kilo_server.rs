use axum::{extract::State, routing::post, Json, Router};
use tower_http::cors::{Any, CorsLayer};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tokio::process::Command;
use tokio::io::{AsyncBufReadExt, BufReader};
use std::process::Stdio;
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;

#[derive(Deserialize)]
pub struct KiloRequest {
    prompt: String,
}

#[derive(Serialize)]
pub struct ResultResponse {
    success: bool,
    message: String,
}

#[derive(Serialize)]
pub struct ErrorResponse {
    error: String,
}

#[derive(Clone)]
struct AppStateExt {
    project_state: Arc<Mutex<Option<String>>>,
    app_handle: AppHandle,
    model_state: Arc<Mutex<String>>,
    abort_tx: Arc<std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
}

#[tauri::command]
pub async fn start_kilo_server(
    app_handle: AppHandle,
    project_state: tauri::State<'_, crate::ActiveProjectState>,
    server_handle: tauri::State<'_, crate::KiloServerHandle>,
    model_state: tauri::State<'_, crate::KiloModelState>,
    abort_handle: tauri::State<'_, crate::KiloAbortSignal>,
    port: u16,
) -> Result<(), String> {
    let mut handle_lock = server_handle.0.lock().unwrap();
    if handle_lock.is_some() {
        return Ok(()); // Already running
    }

    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    *handle_lock = Some(tx);

    let state = AppStateExt {
        project_state: project_state.0.clone(),
        app_handle: app_handle.clone(),
        model_state: model_state.0.clone(),
        abort_tx: abort_handle.0.clone(),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/kilo", post(handle_kilo))
        .layer(cors)
        .with_state(state);

    tokio::spawn(async move {
        let bind_addr = format!("127.0.0.1:{}", port);
        if let Ok(listener) = tokio::net::TcpListener::bind(&bind_addr).await {
            let _ = app_handle.emit("kilo_log", format!("[SYSTEM] Master Context: Kilo local server running at http://localhost:{}", port));
            let _ = app_handle.emit("kilo_status_changed", true);
            
            let server = axum::serve(listener, app).with_graceful_shutdown(async {
                rx.await.ok();
            });
            let _ = server.await;
            
            let _ = app_handle.emit("kilo_log", "[SYSTEM] Kilo server stopped.");
            let _ = app_handle.emit("kilo_status_changed", false);
            
            // Clean up state if it exits
            // But we can't easily access server_handle here without moving it.
            // It will be cleaned up on next start.
        } else {
            let _ = app_handle.emit("kilo_log", format!("[SYSTEM_ERROR] Lỗi: Không thể khởi chạy Kilo server ở port {} (Port có thể bị chiếm dụng).", port));
            let _ = app_handle.emit("kilo_status_changed", false);
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn check_kilo_installed() -> Result<bool, String> {
    let is_windows = cfg!(target_os = "windows");
    let cmd_name = if is_windows { "kilo.cmd" } else { "kilo" };
    
    let mut cmd = tokio::process::Command::new(cmd_name);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // Ngăn cửa sổ cmd đen
    
    let output = cmd.arg("--version").output().await;
    
    match output {
        Ok(out) => Ok(out.status.success()),
        Err(_) => Ok(false)
    }
}

#[tauri::command]
pub async fn install_kilo_cli(app_handle: tauri::AppHandle) -> Result<(), String> {
    let is_windows = cfg!(target_os = "windows");
    let cmd_name = if is_windows { "npm.cmd" } else { "npm" };
    
    let _ = app_handle.emit("kilo_log", "[SYSTEM] Đang cài đặt Kilo CLI (@kilocode/cli)...");
    
    let mut cmd = tokio::process::Command::new(cmd_name);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // Ngăn cửa sổ cmd đen

    let output = cmd
        .args(&["install", "-g", "@kilocode/cli"])
        .output()
        .await
        .map_err(|e| format!("Lỗi thực thi npm: {}", e))?;

    if output.status.success() {
        let _ = app_handle.emit("kilo_log", "[SYSTEM] Cài đặt Kilo CLI thành công. Vui lòng khởi động lại server nếu cần.");
        Ok(())
    } else {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        let _ = app_handle.emit("kilo_log", format!("[ERROR] Lỗi cài đặt: {}", err_msg));
        Err(format!("Lỗi cài đặt: {}", err_msg))
    }
}

#[tauri::command]
pub async fn get_kilo_models() -> Result<Vec<String>, String> {
    let is_windows = cfg!(target_os = "windows");
    let cmd_name = if is_windows { "kilo.cmd" } else { "kilo" };
    
    let mut cmd = tokio::process::Command::new(cmd_name);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // Ngăn cửa sổ cmd đen

    let output = cmd
        .arg("models")
        .output()
        .await
        .map_err(|e| format!("Lỗi khi lấy danh sách model Kilo: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Lỗi Kilo models: {}", err));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut models = Vec::new();
    for line in stdout.lines() {
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            models.push(trimmed.to_string());
        }
    }
    Ok(models)
}

#[tauri::command]
pub async fn init_kilo_config(app_handle: tauri::AppHandle, project_path: String) -> Result<(), String> {
    use tauri::Manager;
    let path = Path::new(&project_path);
    let master_context_dir = path.join(".master-context");
    
    if !master_context_dir.exists() {
        fs::create_dir_all(&master_context_dir).map_err(|e| format!("Lỗi tạo thư mục .master-context: {}", e))?;
    }

    let apply_md_dest = master_context_dir.join("apply.md");
    let opencode_json_dest = path.join("opencode.json");

    // Quản lý file .gitignore
    let gitignore_path = path.join(".gitignore");
    let ignore_entry = "\n# Bỏ qua thư mục tạm của Master Context\n.master-context\n";
    
    if gitignore_path.exists() {
        if let Ok(content) = fs::read_to_string(&gitignore_path) {
            if !content.contains(".master-context") {
                let _ = fs::write(&gitignore_path, format!("{}{}", content, ignore_entry));
            }
        }
    } else {
        let _ = fs::write(&gitignore_path, ignore_entry);
    }

    let resource_dir = app_handle.path().resource_dir().map_err(|e| e.to_string())?;
    let res_dir = resource_dir.join("resources");
    let up_res_dir = resource_dir.join("_up_").join("resources");
    
    let apply_md_src = res_dir.join("apply.md");
    let opencode_src = res_dir.join("opencode.json");

    // Đọc từ thư mục bundle (production) hoặc thư mục gốc (development)
    let apply_md_content = fs::read_to_string(&apply_md_src)
        .or_else(|_| fs::read_to_string(up_res_dir.join("apply.md"))) // Fallback cho thư mục _up_ khi build exe
        .or_else(|_| fs::read_to_string(resource_dir.join("apply.md"))) // Fallback nếu Tauri gộp phẳng file
        .or_else(|_| fs::read_to_string("../resources/apply.md")) // Fallback môi trường Dev
        .unwrap_or_default();

    let mut opencode_json_content = fs::read_to_string(&opencode_src)
        .or_else(|_| fs::read_to_string(up_res_dir.join("opencode.json"))) // Fallback cho thư mục _up_ khi build exe
        .or_else(|_| fs::read_to_string(resource_dir.join("opencode.json")))
        .or_else(|_| fs::read_to_string("../resources/opencode.json"))
        .unwrap_or_default();

    if apply_md_content.is_empty() || opencode_json_content.is_empty() {
        return Err("Không thể đọc file apply.md hoặc opencode.json từ thư mục resources".into());
    }

    // Tự động sửa lại đường dẫn trỏ vào .master-context
    opencode_json_content = opencode_json_content.replace("\"./apply.md\"", "\"./.master-context/apply.md\"");

    fs::write(&apply_md_dest, apply_md_content).map_err(|e| format!("Lỗi ghi apply.md: {}", e))?;
    fs::write(&opencode_json_dest, opencode_json_content).map_err(|e| format!("Lỗi ghi opencode.json: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn open_extension_folder(app_handle: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    use tauri_plugin_opener::OpenerExt;
    
    let resource_dir = app_handle.path().resource_dir().map_err(|e| e.to_string())?;
    let res_dir = resource_dir.join("resources");
    let up_res_dir = resource_dir.join("_up_").join("resources");
    
    let path_to_open = if res_dir.exists() {
        res_dir.to_string_lossy().to_string()
    } else if up_res_dir.exists() {
        up_res_dir.to_string_lossy().to_string()
    } else if std::path::Path::new("../resources").exists() {
        "../resources".to_string()
    } else {
        // Nếu không tìm thấy thư mục con, mở luôn thư mục gốc của App Resources
        resource_dir.to_string_lossy().to_string()
    };

    app_handle.opener().open_path(path_to_open, None::<String>).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn stop_kilo_server(
    server_handle: tauri::State<'_, crate::KiloServerHandle>,
    abort_handle: tauri::State<'_, crate::KiloAbortSignal>,
) -> Result<(), String> {
    // Ép buộc dừng tiến trình Kilo đang chạy (nếu có)
    if let Some(tx) = abort_handle.0.lock().unwrap().take() {
        let _ = tx.send(());
    }
    // Dừng HTTP server
    let mut handle_lock = server_handle.0.lock().unwrap();
    if let Some(tx) = handle_lock.take() {
        let _ = tx.send(());
    }
    Ok(())
}

#[tauri::command]
pub async fn set_kilo_model(
    model: String,
    model_state: tauri::State<'_, crate::KiloModelState>,
) -> Result<(), String> {
    *model_state.0.lock().unwrap() = model;
    Ok(())
}

#[tauri::command]
pub async fn get_kilo_server_status(
    server_handle: tauri::State<'_, crate::KiloServerHandle>,
) -> Result<bool, String> {
    Ok(server_handle.0.lock().unwrap().is_some())
}

async fn handle_kilo(
    State(state): State<AppStateExt>,
    Json(payload): Json<KiloRequest>,
) -> Result<Json<ResultResponse>, (axum::http::StatusCode, Json<ErrorResponse>)> {
    let prompt = payload.prompt;
    let app_handle = state.app_handle;
    
    if prompt.is_empty() {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            Json(ErrorResponse { error: "Vui lòng cung cấp nội dung prompt".into() }),
        ));
    }

    let project_path = {
        let lock = state.project_state.lock().unwrap();
        lock.clone()
    };

    let current_dir = match project_path {
        Some(path) => path,
        None => {
            return Err((
                axum::http::StatusCode::BAD_REQUEST,
                Json(ErrorResponse { error: "Chưa mở dự án nào trong Master Context".into() }),
            ))
        }
    };

    let current_path = Path::new(&current_dir);
    let tasks_dir = current_path.join(".master-context");

    if !tasks_dir.exists() {
        if let Err(e) = fs::create_dir_all(&tasks_dir) {
            return Err((
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse { error: format!("Lỗi tạo thư mục tạm: {}", e) }),
            ));
        }
    }

    // Quản lý file .gitignore
    let gitignore_path = current_path.join(".gitignore");
    let ignore_entry = "\n# Bỏ qua thư mục tạm của Master Context\n.master-context\n";
    
    if gitignore_path.exists() {
        if let Ok(content) = fs::read_to_string(&gitignore_path) {
            if !content.contains(".master-context") {
                let _ = fs::write(&gitignore_path, format!("{}{}", content, ignore_entry));
            }
        }
    } else {
        let _ = fs::write(&gitignore_path, ignore_entry);
    }

    let temp_filename = format!("task_{}.txt", chrono::Utc::now().timestamp_millis());
    let temp_filepath = tasks_dir.join(&temp_filename);

    if let Err(e) = fs::write(&temp_filepath, &prompt) {
        return Err((
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: format!("Lỗi ghi file tạm: {}", e) }),
        ));
    }

    let short_prompt = format!("Vui lòng đọc và áp dụng chính xác các thay đổi mã nguồn từ file sau: {}", temp_filepath.display());
    
    let is_windows = cfg!(target_os = "windows");
    let cmd_name = if is_windows { "kilo.cmd" } else { "kilo" };

    let selected_model = {
        let lock = state.model_state.lock().unwrap();
        lock.clone()
    };

    let _ = app_handle.emit("kilo_log", format!("[SYSTEM] Bắt đầu chạy Kilo CLI tại: {}", current_dir));

        let mut child_cmd = if is_windows {
            let mut c = Command::new("kilo.cmd");
            c.args(&["run", "--auto", &short_prompt])
             .current_dir(&current_dir)
             .stdout(Stdio::piped())
             .stderr(Stdio::piped())
             .kill_on_drop(true);
            #[cfg(target_os = "windows")]
            c.creation_flags(0x08000000); // Ngăn popup cửa sổ cmd đen
            c
        } else {
        let mut c = Command::new(cmd_name);
        c.args(&["run", "--auto", &short_prompt])
         .current_dir(&current_dir)
         .stdout(Stdio::piped())
         .stderr(Stdio::piped())
         .kill_on_drop(true);
        c
    };

    if !selected_model.is_empty() {
        child_cmd.env("KILO_MODEL", &selected_model);
        child_cmd.env("KILOCODE_MODEL", &selected_model);
        let _ = app_handle.emit("kilo_log", format!("[SYSTEM] Sử dụng AI Model: {}", selected_model));
    }

    let (resp_tx, resp_rx) = tokio::sync::oneshot::channel();

    // Đưa toàn bộ vòng đời tiến trình Kilo ra một task độc lập để sống sót kể cả khi Chrome Extension ngắt kết nối HTTP
    tokio::spawn(async move {
        let (abort_tx_oneshot, abort_rx) = tokio::sync::oneshot::channel::<()>();
        {
            let mut lock = state.abort_tx.lock().unwrap();
            *lock = Some(abort_tx_oneshot);
        }

        // Kênh nội bộ để lắng nghe tín hiệu hoàn thành từ stdout
        let (done_tx, mut done_rx) = tokio::sync::mpsc::channel::<()>(1);

        let _ = app_handle.emit("kilo_task_start", ());

        match child_cmd.spawn() {
            Ok(mut process) => {
                let pid = process.id();
                let stdout = process.stdout.take().expect("Failed to open stdout");
                let stderr = process.stderr.take().expect("Failed to open stderr");

                let handle_out = app_handle.clone();
                let done_tx_clone = done_tx.clone();
                tokio::spawn(async move {
                    let mut reader = BufReader::new(stdout).lines();
                    while let Ok(Some(line)) = reader.next_line().await {
                        let _ = handle_out.emit("kilo_log", line.clone());
                        // Bắt tín hiệu hoàn thành tuyệt đối từ AI
                        if line.contains("<<<TASK_COMPLETED>>>") || line.contains("[TASK_COMPLETED]") {
                            let _ = done_tx_clone.send(()).await;
                        }
                    }
                });

            let handle_err = app_handle.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let _ = handle_err.emit("kilo_log", line);
                }
            });

            let result = tokio::select! {
                _ = done_rx.recv() => {
                    // AI báo cáo xong -> Dùng spawn để giải phóng lập tức, không chờ taskkill bị treo
                    let _ = state.abort_tx.lock().unwrap().take();
                    
                    #[cfg(target_os = "windows")]
                    if let Some(p) = pid {
                        let mut kill_cmd = tokio::process::Command::new("taskkill");
                        kill_cmd.args(&["/F", "/T", "/PID", &p.to_string()]);
                        kill_cmd.creation_flags(0x08000000); // Ẩn cửa sổ cmd taskkill
                        let _ = kill_cmd.spawn(); 
                    }
                    let _ = process.kill().await;
                    let _ = fs::remove_file(&temp_filepath);

                    let _ = app_handle.emit("kilo_log", "[SUCCESS] Kilo Agent đã hoàn thành toàn bộ chu trình!");
                    let _ = app_handle.emit("kilo_task_success", ());
                    
                    let _ = app_handle.notification()
                        .builder()
                        .title("Kilo Agent")
                        .body("Đã hoàn thành phân tích và cập nhật mã nguồn!")
                        .show();

                    Ok(Json(ResultResponse {
                        success: true,
                        message: "Kilo Agent đã thực thi xong nhiệm vụ".into(),
                    }))
                }
                status_res = process.wait() => {
                    let _ = state.abort_tx.lock().unwrap().take();
                    
                    let status = match status_res {
                        Ok(s) => s,
                        Err(e) => {
                            let _ = app_handle.emit("kilo_task_error", ());
                            let _ = fs::remove_file(&temp_filepath);
                            let _ = resp_tx.send(Err((
                                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                                Json(ErrorResponse { error: format!("Lỗi chờ tiến trình: {}", e) }),
                            )));
                            return;
                        }
                    };

                    let _ = fs::remove_file(&temp_filepath);

                    if status.success() {
                        let _ = app_handle.emit("kilo_log", "[SUCCESS] Kilo CLI đã hoàn thành nhiệm vụ thành công (Tự thoát).");
                        let _ = app_handle.emit("kilo_task_success", ());
                        
                        let _ = app_handle.notification()
                            .builder()
                            .title("Kilo Agent (Master Context)")
                            .body("Đã hoàn thành phân tích và cập nhật mã nguồn!")
                            .show();

                        Ok(Json(ResultResponse {
                            success: true,
                            message: "Kilo CLI đã thực thi xong nhiệm vụ".into(),
                        }))
                    } else {
                        let _ = app_handle.emit("kilo_log", format!("[ERROR] Kilo CLI kết thúc với mã lỗi: {}", status.code().unwrap_or(-1)));
                        let _ = app_handle.emit("kilo_task_error", ());
                        
                        let _ = app_handle.notification()
                            .builder()
                            .title("Kilo Agent (Lỗi)")
                            .body("Thực thi thất bại, vui lòng kiểm tra Kilo Panel.")
                            .show();

                        Err((
                            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                            Json(ErrorResponse { error: "Kilo CLI kết thúc với lỗi. Vui lòng xem log Kilo Panel.".into() }),
                        ))
                    }
                }
                _ = abort_rx => {
                    #[cfg(target_os = "windows")]
                    if let Some(p) = pid {
                        let mut kill_cmd = tokio::process::Command::new("taskkill");
                        kill_cmd.args(&["/F", "/T", "/PID", &p.to_string()]);
                        kill_cmd.creation_flags(0x08000000); // Ẩn cửa sổ cmd taskkill
                        let _ = kill_cmd.output().await;
                    }
                    let _ = process.kill().await;
                    let _ = fs::remove_file(&temp_filepath);
                    let _ = app_handle.emit("kilo_log", "[ERROR] Kilo CLI đã bị buộc dừng (Killed) bởi người dùng.");
                    let _ = app_handle.emit("kilo_task_error", ());

                    Err((
                        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                        Json(ErrorResponse { error: "Tiến trình đã bị hủy".into() }),
                    ))
                }
            };

            let _ = resp_tx.send(result);
        }
        Err(e) => {
            let _ = app_handle.emit("kilo_log", format!("[ERROR] Lỗi khởi chạy tiến trình Kilo: {}", e));
            let _ = resp_tx.send(Err((
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse { error: format!("Không thể khởi chạy Kilo CLI: {}", e) }),
            )));
        }
    }
    });

    match resp_rx.await {
        Ok(res) => res,
        Err(_) => Err((
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: "Tiến trình xử lý ngầm bị ngắt kết nối".into() }),
        ))
    }
}
