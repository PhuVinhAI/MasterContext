use axum::{extract::State, routing::post, Json, Router};
use tower_http::cors::{Any, CorsLayer};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tokio::process::Command;

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

pub async fn run_server(project_state: Arc<Mutex<Option<String>>>) {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/kilo", post(handle_kilo))
        .layer(cors)
        .with_state(project_state);

    if let Ok(listener) = tokio::net::TcpListener::bind("127.0.0.1:9999").await {
        println!("🚀 Master Context: Kilo local server running at http://localhost:9999");
        let _ = axum::serve(listener, app).await;
    } else {
        eprintln!("⚠️ Master Context: Không thể khởi chạy Kilo server ở port 9999 (Có thể port đã bị chiếm dụng).");
    }
}

async fn handle_kilo(
    State(state): State<Arc<Mutex<Option<String>>>>,
    Json(payload): Json<KiloRequest>,
) -> Result<Json<ResultResponse>, (axum::http::StatusCode, Json<ErrorResponse>)> {
    let prompt = payload.prompt;
    
    if prompt.is_empty() {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            Json(ErrorResponse { error: "Vui lòng cung cấp nội dung prompt".into() }),
        ));
    }

    let project_path = {
        let lock = state.lock().unwrap();
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

    println!("🤖 Đang gọi Kilo CLI tại: {}", current_dir);

    let output_future = if is_windows {
        let command_string = format!("{} run --auto \"{}\"", cmd_name, short_prompt);
        Command::new("cmd.exe")
            .args(&["/c", &command_string])
            .current_dir(&current_dir)
            .output()
    } else {
        Command::new(cmd_name)
            .args(&["run", "--auto", &short_prompt])
            .current_dir(&current_dir)
            .output()
    };

    // Đợi Kilo xử lý xong (Async)
    let output = output_future.await;

    // Dọn dẹp file tạm
    let _ = fs::remove_file(&temp_filepath);

    match output {
        Ok(out) => {
            if out.status.success() {
                Ok(Json(ResultResponse {
                    success: true,
                    message: "Kilo CLI đã thực thi xong nhiệm vụ".into(),
                }))
            } else {
                let stderr = String::from_utf8_lossy(&out.stderr);
                Err((
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse { error: format!("Kilo CLI kết thúc với lỗi: {}", stderr) }),
                ))
            }
        }
        Err(e) => Err((
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: format!("Không thể khởi chạy Kilo CLI: {}", e) }),
        )),
    }
}