use axum::{extract::State, routing::post, Json, Router};
use tower_http::cors::{Any, CorsLayer};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;

use crate::patch_executor::{parse_patch_file, apply_operations};

#[derive(Deserialize)]
pub struct PatchRequest {
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
pub async fn start_patch_server(
    app_handle: AppHandle,
    project_state: tauri::State<'_, crate::ActiveProjectState>,
    server_handle: tauri::State<'_, crate::PatchServerHandle>,
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
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        // Hỗ trợ cả /api/patch và /api/kilo để tương thích chéo với Extension hiện tại
        .route("/api/patch", post(handle_patch))
        .route("/api/kilo", post(handle_patch)) 
        .layer(cors)
        .with_state(state);

    tokio::spawn(async move {
        let bind_addr = format!("127.0.0.1:{}", port);
        if let Ok(listener) = tokio::net::TcpListener::bind(&bind_addr).await {
            let _ = app_handle.emit("patch_log", format!("[SYSTEM] Auto-Patch server running at http://localhost:{}", port));
            let _ = app_handle.emit("patch_status_changed", true);
            
            let server = axum::serve(listener, app).with_graceful_shutdown(async {
                rx.await.ok();
            });
            let _ = server.await;
            
            let _ = app_handle.emit("patch_log", "[SYSTEM] Auto-Patch server stopped.");
            let _ = app_handle.emit("patch_status_changed", false);
        } else {
            let _ = app_handle.emit("patch_log", format!("[SYSTEM_ERROR] Lỗi: Không thể khởi chạy Auto-Patch server ở port {} (Port có thể bị chiếm dụng).", port));
            let _ = app_handle.emit("patch_status_changed", false);
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_patch_server(
    server_handle: tauri::State<'_, crate::PatchServerHandle>,
) -> Result<(), String> {
    let mut handle_lock = server_handle.0.lock().unwrap();
    if let Some(tx) = handle_lock.take() {
        let _ = tx.send(());
    }
    Ok(())
}

#[tauri::command]
pub async fn get_patch_server_status(
    server_handle: tauri::State<'_, crate::PatchServerHandle>,
) -> Result<bool, String> {
    Ok(server_handle.0.lock().unwrap().is_some())
}

async fn handle_patch(
    State(state): State<AppStateExt>,
    Json(payload): Json<PatchRequest>,
) -> Result<Json<ResultResponse>, (axum::http::StatusCode, Json<ErrorResponse>)> {
    let prompt = payload.prompt;
    let app_handle = state.app_handle;
    
    if prompt.is_empty() {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            Json(ErrorResponse { error: "Vui lòng cung cấp nội dung patch".into() }),
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

    let _ = app_handle.emit("patch_task_start", ());
    let _ = app_handle.emit("patch_log", "[SYSTEM] Nhận được payload từ AI Studio Archiver. Đang phân tích...");

    let current_path = Path::new(&current_dir);
    let tasks_dir = current_path.join(".master-context");

    if !tasks_dir.exists() {
        let _ = fs::create_dir_all(&tasks_dir);
    }

    let temp_filename = format!("patch_{}.txt", chrono::Utc::now().timestamp_millis());
    let temp_filepath = tasks_dir.join(&temp_filename);

    let _ = fs::write(&temp_filepath, &prompt);

    // Parse and apply directly in Rust
    let operations = parse_patch_file(&prompt);
    
    if operations.is_empty() {
        let _ = app_handle.emit("patch_log", "[WARNING] Không tìm thấy chỉ thị PATCH hợp lệ nào trong payload.");
        let _ = app_handle.emit("patch_task_success", ());
        return Ok(Json(ResultResponse {
            success: true,
            message: "Không có tác vụ nào được thực thi".into(),
        }));
    }

    apply_operations(&app_handle, current_path, operations).await;

    Ok(Json(ResultResponse {
        success: true,
        message: "Yêu cầu Patch đã được đưa vào luồng thực thi".into(),
    }))
}