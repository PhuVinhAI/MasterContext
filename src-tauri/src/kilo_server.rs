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
}

#[tauri::command]
pub async fn start_kilo_server(
    app_handle: AppHandle,
    project_state: tauri::State<'_, crate::ActiveProjectState>,
    server_handle: tauri::State<'_, crate::KiloServerHandle>,
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
        if let Ok(listener) = tokio::net::TcpListener::bind("127.0.0.1:9999").await {
            let _ = app_handle.emit("kilo_log", "🚀 Master Context: Kilo local server running at http://localhost:9999");
            let _ = app_handle.emit("kilo_status_changed", true);
            
            let server = axum::serve(listener, app).with_graceful_shutdown(async {
                rx.await.ok();
            });
            let _ = server.await;
            
            let _ = app_handle.emit("kilo_log", "🛑 Kilo server stopped.");
            let _ = app_handle.emit("kilo_status_changed", false);
            
            // Clean up state if it exits
            // But we can't easily access server_handle here without moving it.
            // It will be cleaned up on next start.
        } else {
            let _ = app_handle.emit("kilo_log", "⚠️ Lỗi: Không thể khởi chạy Kilo server ở port 9999 (Port có thể bị chiếm dụng).");
            let _ = app_handle.emit("kilo_status_changed", false);
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_kilo_server(
    server_handle: tauri::State<'_, crate::KiloServerHandle>,
) -> Result<(), String> {
    let mut handle_lock = server_handle.0.lock().unwrap();
    if let Some(tx) = handle_lock.take() {
        let _ = tx.send(());
    }
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
    let tasks_dir = current_path.join(".kilo-tasks");

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
    let ignore_entry = "\n# Bỏ qua thư mục tạm của Kilo Auto-Watch\n.kilo-tasks\n";
    
    if gitignore_path.exists() {
        if let Ok(content) = fs::read_to_string(&gitignore_path) {
            if !content.contains(".kilo-tasks") {
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

    let _ = app_handle.emit("kilo_log", format!("🤖 Bắt đầu chạy Kilo CLI tại: {}", current_dir));

    let mut child = if is_windows {
        let command_string = format!("{} run --auto \"{}\"", cmd_name, short_prompt);
        Command::new("cmd.exe")
            .args(&["/c", &command_string])
            .current_dir(&current_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
    } else {
        Command::new(cmd_name)
            .args(&["run", "--auto", &short_prompt])
            .current_dir(&current_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
    };

    match child {
        Ok(mut process) => {
            let stdout = process.stdout.take().expect("Failed to open stdout");
            let stderr = process.stderr.take().expect("Failed to open stderr");

            let handle_out = app_handle.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let _ = handle_out.emit("kilo_log", line);
                }
            });

            let handle_err = app_handle.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let _ = handle_err.emit("kilo_log", format!("[ERROR] {}", line));
                }
            });

            // Đợi Kilo xử lý xong (Async)
            let status = process.wait().await.map_err(|e| {
                (
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse { error: format!("Lỗi chờ tiến trình: {}", e) }),
                )
            })?;

            // Dọn dẹp file tạm
            let _ = fs::remove_file(&temp_filepath);

            if status.success() {
                let _ = app_handle.emit("kilo_log", "✅ Kilo CLI đã hoàn thành nhiệm vụ thành công.");
                Ok(Json(ResultResponse {
                    success: true,
                    message: "Kilo CLI đã thực thi xong nhiệm vụ".into(),
                }))
            } else {
                let _ = app_handle.emit("kilo_log", format!("❌ Kilo CLI kết thúc với mã lỗi: {}", status.code().unwrap_or(-1)));
                Err((
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse { error: "Kilo CLI kết thúc với lỗi. Vui lòng xem log Kilo Panel.".into() }),
                ))
            }
        }
        Err(e) => {
            let _ = app_handle.emit("kilo_log", format!("❌ Lỗi khởi chạy tiến trình Kilo: {}", e));
            Err((
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse { error: format!("Không thể khởi chạy Kilo CLI: {}", e) }),
            ))
        }
    }
}
