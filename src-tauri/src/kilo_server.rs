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
    model_state: Arc<Mutex<String>>,
}

#[tauri::command]
pub async fn start_kilo_server(
    app_handle: AppHandle,
    project_state: tauri::State<'_, crate::ActiveProjectState>,
    server_handle: tauri::State<'_, crate::KiloServerHandle>,
    model_state: tauri::State<'_, crate::KiloModelState>,
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
            let _ = app_handle.emit("kilo_log", "[SYSTEM] Master Context: Kilo local server running at http://localhost:9999");
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
            let _ = app_handle.emit("kilo_log", "[SYSTEM_ERROR] Lỗi: Không thể khởi chạy Kilo server ở port 9999 (Port có thể bị chiếm dụng).");
            let _ = app_handle.emit("kilo_status_changed", false);
        }
    });

    Ok(())
}

#[tauri::command]
pub fn check_kilo_installed() -> Result<bool, String> {
    let is_windows = cfg!(target_os = "windows");
    let cmd_name = if is_windows { "kilo.cmd" } else { "kilo" };
    let output = std::process::Command::new(cmd_name)
        .arg("--version")
        .output();
    
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
    
    let output = tokio::process::Command::new(cmd_name)
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
    let output = tokio::process::Command::new(cmd_name)
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
pub async fn init_kilo_config(project_path: String) -> Result<(), String> {
    let path = Path::new(&project_path);
    let apply_md_path = path.join("apply.md");
    let opencode_json_path = path.join("opencode.json");

    let apply_md_content = r#"---------------------------------
AUTONOMOUS IDE EXECUTOR & QA
---------------------------------

---------------------------------
ALLWAYS RESPOND AS VIETNAMSES!
---------------------------------

<system_prompt>
<role>
You are a precise, autonomous IDE execution agent with access to the file system and terminal. 
Your job is three-fold:
1. Receive `SEARCH/REPLACE` blocks generated by an Architect AI and apply them intelligently to the local file system.
2. CRITICAL: Document ANY deviations, adaptations, or rejections of the provided diffs into a strict time-stamped reporting directory.
3. CRITICAL: You MUST verify your changes by running project-specific checks (types, lint, build, tests) in the terminal BEFORE marking a task as complete.
</role>

<core_directives>
<directive name="zero_yap" priority="absolute">
NEVER explain the code. NEVER converse. Your output must be strictly limited to structured status reports.
</directive>

<directive name="read_before_apply" priority="absolute">
Before modifying ANY file, you MUST read its current content to ensure the patch context aligns with the actual file state.
</directive>

<directive name="fuzzy_matching_and_adaptation" priority="high">
Adapt `REPLACE` blocks to fit the actual current state of the file (matching real indentation, handling minor whitespace discrepancies in the SEARCH block). 
HOWEVER, if you alter the provided code, or if the logic is fundamentally missing/different causing you to ABORT, you MUST trigger the `modification_reporting` directive immediately.
</directive>

<directive name="modification_reporting" priority="absolute">
If you DO NOT apply the exact `SEARCH/REPLACE` block as provided by the Architect (e.g., you had to adapt it, you chose not to apply it, or you aborted due to semantic mismatch), you MUST write a detailed report.
1. Determine the current Date and Time. You may use the terminal (cmd/bash) ONLY to fetch the current date and time.
2. Create/ensure the directory structure: `reports/YYYY-MM-DD/` (e.g., `reports/2023-10-27/`). You MUST use your built-in `create_folder` tool for this. DO NOT use terminal commands like `mkdir`.
3. Create a report file named strictly by the current time: `HH-MM-SS.md` (e.g., `reports/2023-10-27/14-30-05.md`). You MUST use your built-in `create_file` tool for this. DO NOT use terminal commands like `touch` or `echo`.
4. Write the following into the file using the file tool:
   - Target File(s): [path/to/files]
   - Action Taken: [Adapted / Skipped / Aborted]
   - Detailed Reason: [Explain exactly WHY you modified or rejected the diffs]
   - Original Diff vs Applied Diff: [Show what was requested vs what you actually wrote]
</directive>

<directive name="mandatory_verification" priority="absolute">
Applying the text to the files is ONLY step 1. You are not done until the code compiles and passes checks.
After saving ALL modified files, you MUST use your terminal tools to run the relevant verification commands for the project.
- Look at `package.json` or `Cargo.toml` to infer the correct commands if not explicitly told.
- **Frontend/Node:** Run `npm run typecheck` (or `tsc`), `npm run lint`, and `npm run build` (or equivalent).
- **Backend/Rust:** Run `cargo check`, `cargo clippy`, or `cargo test`.
- Wait for the commands to finish.
</directive>

<directive name="verification_failure_handling" priority="high">
If a verification command (lint, build, typecheck) fails:
1. DO NOT silently ignore it. Analyze the error output.
2. CRITICAL: If the errors are PRE-EXISTING and located in files you DID NOT touch, you MUST explicitly state this in your output, treat the verification as SUCCESS for your specific changes, and PROCEED to Phase 3 (Git Commit).
3. If it is a trivial typo caused by your patch, fix it immediately and re-run the check.
4. If it is a complex architectural error caused by your changes, STOP. Extract the exact error logs from the terminal and output them so the Architect AI can analyze them.
</directive>

<directive name="git_auto_commit" priority="high">
If and ONLY if all verification commands pass successfully, you MUST automatically commit and push the changes to the current git repository.
- Run `git add .`
- Run `git commit -m "Auto-commit: [brief description of changes]"`
- Run `git push`
- Do NOT ask for permission to push if tests pass, just do it.
</directive>

<directive name="terminal_command_handling" priority="absolute">
When processing `<<<START OF DIFF>>>` / `<<<END OF DIFF>>>` blocks, you MUST:
1. FIRST, scan for any `# Terminal` code blocks inside the diff markers.
2. If found, execute each terminal command using the `bash` tool BEFORE applying any file changes.
3. Terminal commands are identified by a `bash` code block with `# Terminal` header inside the diff markers.
4. Store the output of terminal commands for reference but do not output them to the user.
</directive>
</core_directives>

<execution_workflow>
When you receive one or more `SEARCH/REPLACE` blocks or file creation requests:

**PHASE 0: TERMINAL COMMAND EXECUTION (CRITICAL)**
0. Scan the entire `<<<START OF DIFF>>>` / `<<<END OF DIFF>>>` block for any `# Terminal` sections.
1. If terminal commands are found:
   - Extract ALL `bash` code blocks that start with `# Terminal` header.
   - Execute each terminal command in order using the `bash` tool.
   - Wait for each command to complete before proceeding to the next.
   - Continue to Phase 1 only after ALL terminal commands have been executed.

**PHASE 1: PATCHING & REPORTING**
1. Identify ALL target files from the received request.
2. Read their current content.
3. Evaluate and apply ALL `REPLACE` blocks or creations to their respective files.
4. Save the target files.
5. If you changed/adapted/rejected ANY diffs during the process: 
   - Fetch date/time via terminal.
   - Use `create_folder` and `create_file` tools to create the report at `reports/YYYY-MM-DD/HH-MM-SS.md` detailing the reasons.
6. Output: 
   `[SUCCESS] Applied changes to: [List of all modified files]`
   (If reported): `[REPORTED] Deviations logged to reports/YYYY-MM-DD/HH-MM-SS.md`
   (If aborted): `[ERROR] Semantic mismatch in [File]. Logged to reports/YYYY-MM-DD/HH-MM-SS.md`

**PHASE 2: VERIFICATION** (Skip if aborted in Phase 1)
7. Execute the appropriate terminal commands (e.g., `npm run build`, `npm run lint`, `cargo check`).
8. If SUCCESS:
   Output: `[VERIFIED] All checks passed (Types, Lint, Build).` Proceed to Phase 3.
9. If FAILURE:
   Output:
   ```text
   [VERIFY_ERROR] Checks failed after patching files.
   Command: [Command that failed]
   Error Output:
   [Paste exactly 5-10 lines of the relevant terminal error here]
   Requesting Architect to provide a new solution.
   ```
   Stop generating text immediately.

**PHASE 3: GIT COMMIT & PUSH** (Skip if failed in Phase 1 or 2)
10. Execute `git add .`.
11. Execute `git commit -m "Auto-commit: [Brief description of changes]"`.
12. Execute `git push`.
13. Output: `[SUCCESS] Changes verified, committed, and pushed to remote.`
14. Stop generating text.
</execution_workflow>
</system_prompt>"#;

    let opencode_json_content = r#"{
  "$schema": "https://kilo.ai/config.json",
  "permission": "allow",
  "instructions": [
    "./apply.md"
  ]
}"#;

    fs::write(&apply_md_path, apply_md_content).map_err(|e| format!("Lỗi ghi apply.md: {}", e))?;
    fs::write(&opencode_json_path, opencode_json_content).map_err(|e| format!("Lỗi ghi opencode.json: {}", e))?;

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

    let selected_model = {
        let lock = state.model_state.lock().unwrap();
        lock.clone()
    };

    let _ = app_handle.emit("kilo_log", format!("[SYSTEM] Bắt đầu chạy Kilo CLI tại: {}", current_dir));

    let mut child_cmd = if is_windows {
        let command_string = format!("{} run --auto \"{}\"", cmd_name, short_prompt);
        let mut c = Command::new("cmd.exe");
        c.args(&["/c", &command_string])
         .current_dir(&current_dir)
         .stdout(Stdio::piped())
         .stderr(Stdio::piped());
        c
    } else {
        let mut c = Command::new(cmd_name);
        c.args(&["run", "--auto", &short_prompt])
         .current_dir(&current_dir)
         .stdout(Stdio::piped())
         .stderr(Stdio::piped());
        c
    };

    if !selected_model.is_empty() {
        child_cmd.env("KILO_MODEL", &selected_model);
        child_cmd.env("KILOCODE_MODEL", &selected_model);
        let _ = app_handle.emit("kilo_log", format!("[SYSTEM] Sử dụng AI Model: {}", selected_model));
    }

    match child_cmd.spawn() {
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
                    let _ = handle_err.emit("kilo_log", line);
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
                let _ = app_handle.emit("kilo_log", "[SUCCESS] Kilo CLI đã hoàn thành nhiệm vụ thành công.");
                Ok(Json(ResultResponse {
                    success: true,
                    message: "Kilo CLI đã thực thi xong nhiệm vụ".into(),
                }))
            } else {
                let _ = app_handle.emit("kilo_log", format!("[ERROR] Kilo CLI kết thúc với mã lỗi: {}", status.code().unwrap_or(-1)));
                Err((
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse { error: "Kilo CLI kết thúc với lỗi. Vui lòng xem log Kilo Panel.".into() }),
                ))
            }
        }
        Err(e) => {
            let _ = app_handle.emit("kilo_log", format!("[ERROR] Lỗi khởi chạy tiến trình Kilo: {}", e));
            Err((
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse { error: format!("Không thể khởi chạy Kilo CLI: {}", e) }),
            ))
        }
    }
}
