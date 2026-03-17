use std::fs;
use std::path::Path;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, PartialEq)]
pub enum PatchOpType {
    Modify,
    Create,
    Delete,
    Rename,
    Mkdir,
    Command,
    Commit,
}

#[derive(Debug, Clone)]
pub struct SearchReplace {
    pub search: String,
    pub replace: String,
}

#[derive(Debug, Clone)]
pub struct PatchOperation {
    pub op_type: PatchOpType,
    pub file: String,
    pub old_file: Option<String>,
    pub new_file: Option<String>,
    pub content: Vec<String>,
    pub patches: Vec<SearchReplace>,
}

fn normalize_line_endings(s: &str) -> String {
    s.replace("\r\n", "\n").replace('\r', "\n")
}

pub fn parse_patch_file(content: &str) -> Vec<PatchOperation> {
    let normalized = normalize_line_endings(content);
    let lines: Vec<&str> = normalized.split('\n').collect();

    let mut operations: Vec<PatchOperation> = Vec::new();
    let mut current_op: Option<PatchOperation> = None;

    #[derive(PartialEq)]
    enum State {
        Idle,
        Search,
        Replace,
        Content,
    }
    let mut state = State::Idle;

    let mut search_block: Vec<String> = Vec::new();
    let mut replace_block: Vec<String> = Vec::new();

    for line in lines {
        // Regex equivalents
        if line.to_lowercase().starts_with("# file:") {
            if let Some(op) = current_op.take() {
                operations.push(op);
            }
            let file = line[7..].trim().to_string();
            current_op = Some(PatchOperation {
                op_type: PatchOpType::Modify,
                file,
                old_file: None,
                new_file: None,
                content: vec![],
                patches: vec![],
            });
            state = State::Idle;
            continue;
        }
        if line.to_lowercase().starts_with("# create:") {
            if let Some(op) = current_op.take() {
                operations.push(op);
            }
            let file = line[9..].trim().to_string();
            current_op = Some(PatchOperation {
                op_type: PatchOpType::Create,
                file,
                old_file: None,
                new_file: None,
                content: vec![],
                patches: vec![],
            });
            state = State::Idle;
            continue;
        }
        if line.to_lowercase().starts_with("# delete:") {
            if let Some(op) = current_op.take() {
                operations.push(op);
            }
            let file = line[9..].trim().to_string();
            operations.push(PatchOperation {
                op_type: PatchOpType::Delete,
                file,
                old_file: None,
                new_file: None,
                content: vec![],
                patches: vec![],
            });
            current_op = None;
            state = State::Idle;
            continue;
        }
        if line.to_lowercase().starts_with("# rename:") {
            if let Some(op) = current_op.take() {
                operations.push(op);
            }
            let parts: Vec<&str> = line[9..].split("->").collect();
            if parts.len() == 2 {
                operations.push(PatchOperation {
                    op_type: PatchOpType::Rename,
                    file: String::new(),
                    old_file: Some(parts[0].trim().to_string()),
                    new_file: Some(parts[1].trim().to_string()),
                    content: vec![],
                    patches: vec![],
                });
            }
            current_op = None;
            state = State::Idle;
            continue;
        }
        if line.to_lowercase().starts_with("# mkdir:") {
            if let Some(op) = current_op.take() {
                operations.push(op);
            }
            let file = line[8..].trim().to_string();
            operations.push(PatchOperation {
                op_type: PatchOpType::Mkdir,
                file,
                old_file: None,
                new_file: None,
                content: vec![],
                patches: vec![],
            });
            current_op = None;
            state = State::Idle;
            continue;
        }
        if line.to_lowercase().starts_with("# terminal:") {
            if let Some(op) = current_op.take() {
                operations.push(op);
            }
            let cmd = line[11..].trim().to_string();
            operations.push(PatchOperation {
                op_type: PatchOpType::Command,
                file: cmd,
                old_file: None,
                new_file: None,
                content: vec![],
                patches: vec![],
            });
            current_op = None;
            state = State::Idle;
            continue;
        }
        if line.to_lowercase().starts_with("# commit:") {
            if let Some(op) = current_op.take() {
                operations.push(op);
            }
            let msg = line[9..].trim().to_string();
            operations.push(PatchOperation {
                op_type: PatchOpType::Commit,
                file: msg,
                old_file: None,
                new_file: None,
                content: vec![],
                patches: vec![],
            });
            current_op = None;
            state = State::Idle;
            continue;
        }

        if line.starts_with("<<<<<<< SEARCH") {
            if let Some(ref op) = current_op {
                if op.op_type == PatchOpType::Modify {
                    state = State::Search;
                    search_block.clear();
                    continue;
                }
            }
        }
        if line.starts_with("=======") && state == State::Search {
            state = State::Replace;
            replace_block.clear();
            continue;
        }
        if line.starts_with(">>>>>>> REPLACE") && state == State::Replace {
            state = State::Idle;
            if let Some(ref mut op) = current_op {
                op.patches.push(SearchReplace {
                    search: search_block.join("\n"),
                    replace: replace_block.join("\n"),
                });
            }
            continue;
        }

        if line.starts_with("<<<<<<< CONTENT") {
            if let Some(ref op) = current_op {
                if op.op_type == PatchOpType::Create {
                    state = State::Content;
                    continue;
                }
            }
        }
        if line.starts_with(">>>>>>> END") && state == State::Content {
            state = State::Idle;
            continue;
        }

        match state {
            State::Search => search_block.push(line.to_string()),
            State::Replace => replace_block.push(line.to_string()),
            State::Content => {
                if let Some(ref mut op) = current_op {
                    op.content.push(line.to_string());
                }
            }
            State::Idle => {}
        }
    }

    if let Some(op) = current_op {
        operations.push(op);
    }

    operations
}

pub fn apply_operations(app_handle: &AppHandle, root_dir: &Path, operations: Vec<PatchOperation>) {
    let mut total_files_updated = 0;
    let mut total_files_created = 0;
    let mut total_files_deleted = 0;
    let mut total_files_renamed = 0;
    let mut total_dirs_created = 0;
    let mut total_patches_applied = 0;
    let mut total_patches_failed = 0;
    let mut total_ops_failed = 0;

    let _ = app_handle.emit(
        "patch_log",
        format!("[SYSTEM] Bắt đầu thực thi {} tác vụ...", operations.len()),
    );

    for (idx, op) in operations.into_iter().enumerate() {
        // Tạo ID duy nhất bằng cách kết hợp tên file và index để tránh việc UI ghi đè lên nhau
        let op_id = format!("{}_{}", op.file, idx);
        let emit_event =
            |app: &AppHandle, id: &str, file: &str, op_type: &str, status: &str, msg: &str| {
                let _ = app.emit(
                    "patch_file_event",
                    serde_json::json!({
                        "id": id,
                        "file": file,
                        "opType": op_type,
                        "status": status,
                        "message": msg
                    }),
                );
            };

        match op.op_type {
            PatchOpType::Commit => {
                let msg = op.file.clone();

                emit_event(
                    app_handle,
                    &op_id,
                    "Git Auto-Commit",
                    "command",
                    "pending",
                    &format!("Đang thực thi Git Commit: {}", msg),
                );

                if total_patches_failed > 0 || total_ops_failed > 0 {
                    emit_event(
                        app_handle,
                        &op_id,
                        "Git Auto-Commit",
                        "command",
                        "error",
                        "Đã bỏ qua Git Commit & Push vì có lỗi trong các bước trước (patch hỏng hoặc lệnh terminal thất bại).",
                    );
                    continue;
                }

                let run_cmd = |cmd_name: &str, args: &[&str]| -> Result<String, String> {
                    let mut c = std::process::Command::new(cmd_name);
                    c.current_dir(root_dir).args(args);
                    #[cfg(target_os = "windows")]
                    {
                        use std::os::windows::process::CommandExt;
                        c.creation_flags(0x08000000);
                    }
                    
                    match c.output() {
                        Ok(output) => {
                            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                            let mut full_output = String::new();
                            if !stdout.trim().is_empty() {
                                full_output.push_str(&stdout);
                            }
                            if !stderr.trim().is_empty() {
                                if !full_output.is_empty() {
                                    full_output.push_str("\n");
                                }
                                full_output.push_str("--- STDERR ---\n");
                                full_output.push_str(&stderr);
                            }
                            if output.status.success() {
                                Ok(full_output)
                            } else {
                                Err(full_output)
                            }
                        }
                        Err(e) => Err(format!("Lỗi chạy {}: {}", cmd_name, e)),
                    }
                };

                let mut success = true;
                let mut err_msg = String::new();

                // 1. git add .
                if let Err(e) = run_cmd("git", &["add", "."]) {
                    success = false;
                    err_msg.push_str(&format!("Git Add Failed:\n{}\n", e));
                }

                // 2. git commit
                if success {
                    match run_cmd("git", &["commit", "-m", &msg]) {
                        Ok(_) => {},
                        Err(e) => {
                            // Bỏ qua lỗi nếu không có thay đổi (working tree clean)
                            if !e.contains("nothing to commit") && !e.contains("working tree clean") {
                                success = false;
                                err_msg.push_str(&format!("Git Commit Failed:\n{}\n", e));
                            }
                        }
                    }
                }

                // 3. git push
                if success {
                    if let Err(e) = run_cmd("git", &["push"]) {
                        success = false;
                        err_msg.push_str(&format!("Git Push Failed:\n{}\n", e));
                    }
                }

                if success {
                    emit_event(
                        app_handle,
                        &op_id,
                        "Git Auto-Commit",
                        "command",
                        "success",
                        "Đã Commit & Push thành công!",
                    );
                } else {
                    emit_event(
                        app_handle,
                        &op_id,
                        "Git Auto-Commit",
                        "command",
                        "error",
                        &err_msg,
                    );
                    total_ops_failed += 1;
                }
            }
            PatchOpType::Command => {
                let cmd_str = op.file.clone();
                emit_event(
                    app_handle,
                    &op_id,
                    &cmd_str,
                    "command",
                    "pending",
                    "Đang thực thi lệnh...",
                );

                let is_windows = cfg!(target_os = "windows");
                let mut cmd = if is_windows {
                    let mut c = std::process::Command::new("cmd");
                    let full_cmd = format!("chcp 65001 > nul & {}", cmd_str);
                    c.args(&["/C", &full_cmd]);
                    #[cfg(target_os = "windows")]
                    use std::os::windows::process::CommandExt;
                    #[cfg(target_os = "windows")]
                    c.creation_flags(0x08000000);
                    c
                } else {
                    let mut c = std::process::Command::new("sh");
                    c.arg("-c").arg(&cmd_str);
                    c
                };

                cmd.current_dir(root_dir);

                match cmd.output() {
                    Ok(output) => {
                        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                        let mut full_output = String::new();
                        if !stdout.trim().is_empty() {
                            full_output.push_str(&stdout);
                        }
                        if !stderr.trim().is_empty() {
                            if !full_output.is_empty() {
                                full_output.push_str("\n\n");
                            }
                            full_output.push_str("--- STDERR ---\n");
                            full_output.push_str(&stderr);
                        }
                        if full_output.trim().is_empty() {
                            full_output =
                                "Lệnh đã chạy thành công (Không có output trả về)".to_string();
                        }

                        if output.status.success() {
                            emit_event(
                                app_handle,
                                &op_id,
                                &cmd_str,
                                "command",
                                "success",
                                &full_output,
                            );
                        } else {
                            emit_event(
                                app_handle,
                                &op_id,
                                &cmd_str,
                                "command",
                                "error",
                                &format!(
                                    "Mã lỗi ({}):\n{}",
                                    output.status.code().unwrap_or(-1),
                                    full_output
                                ),
                            );
                            total_ops_failed += 1;
                        }
                    }
                    Err(e) => {
                        emit_event(
                            app_handle,
                            &op_id,
                            &cmd_str,
                            "command",
                            "error",
                            &format!("Không thể khởi chạy process: {}", e),
                        );
                        total_ops_failed += 1;
                    }
                }
            }
            PatchOpType::Mkdir => {
                let absolute_path = root_dir.join(&op.file);
                match fs::create_dir_all(&absolute_path) {
                    Ok(_) => {
                        emit_event(
                            app_handle,
                            &op_id,
                            &op.file,
                            "mkdir",
                            "success",
                            "Tạo thư mục thành công",
                        );
                        total_dirs_created += 1;
                    }
                    Err(e) => {
                        emit_event(
                            app_handle,
                            &op_id,
                            &op.file,
                            "mkdir",
                            "error",
                            &e.to_string(),
                        );
                        total_ops_failed += 1;
                    }
                }
            }
            PatchOpType::Delete => {
                let absolute_path = root_dir.join(&op.file);
                if absolute_path.exists() {
                    let res = if absolute_path.is_dir() {
                        fs::remove_dir_all(&absolute_path)
                    } else {
                        fs::remove_file(&absolute_path)
                    };
                    match res {
                        Ok(_) => {
                            emit_event(
                                app_handle,
                                &op_id,
                                &op.file,
                                "delete",
                                "success",
                                "Xóa thành công",
                            );
                            total_files_deleted += 1;
                        }
                        Err(e) => {
                            emit_event(
                                app_handle,
                                &op_id,
                                &op.file,
                                "delete",
                                "error",
                                &e.to_string(),
                            );
                            total_ops_failed += 1;
                        }
                    }
                } else {
                    emit_event(
                        app_handle,
                        &op_id,
                        &op.file,
                        "delete",
                        "success",
                        "Bỏ qua (Không tìm thấy)",
                    );
                }
            }
            PatchOpType::Rename => {
                if let (Some(old_f), Some(new_f)) = (&op.old_file, &op.new_file) {
                    let old_path = root_dir.join(old_f);
                    let new_path = root_dir.join(new_f);
                    if old_path.exists() {
                        if let Some(parent) = new_path.parent() {
                            let _ = fs::create_dir_all(parent);
                        }
                        match fs::rename(&old_path, &new_path) {
                            Ok(_) => {
                                emit_event(
                                    app_handle,
                                    &op_id,
                                    &format!("{} -> {}", old_f, new_f),
                                    "rename",
                                    "success",
                                    "Đổi tên thành công",
                                );
                                total_files_renamed += 1;
                            }
                            Err(e) => {
                                emit_event(
                                    app_handle,
                                    &op_id,
                                    old_f,
                                    "rename",
                                    "error",
                                    &e.to_string(),
                                );
                                total_ops_failed += 1;
                            }
                        }
                    } else {
                        emit_event(
                            app_handle,
                            &op_id,
                            old_f,
                            "rename",
                            "error",
                            "Không tìm thấy file gốc",
                        );
                        total_ops_failed += 1;
                    }
                }
            }
            PatchOpType::Create => {
                let absolute_path = root_dir.join(&op.file);
                if let Some(parent) = absolute_path.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let content_str = op.content.join("\n");
                match fs::write(&absolute_path, content_str) {
                    Ok(_) => {
                        emit_event(
                            app_handle,
                            &op_id,
                            &op.file,
                            "create",
                            "success",
                            "Tạo file thành công",
                        );
                        total_files_created += 1;
                    }
                    Err(e) => {
                        emit_event(
                            app_handle,
                            &op_id,
                            &op.file,
                            "create",
                            "error",
                            &e.to_string(),
                        );
                        total_ops_failed += 1;
                    }
                }
            }
            PatchOpType::Modify => {
                let absolute_path = root_dir.join(&op.file);
                if !absolute_path.exists() {
                    emit_event(
                        app_handle,
                        &op_id,
                        &op.file,
                        "modify",
                        "error",
                        "File không tồn tại",
                    );
                    total_patches_failed += op.patches.len();
                    total_ops_failed += 1;
                    continue;
                }

                match fs::read_to_string(&absolute_path) {
                    Ok(raw_content) => {
                        let mut file_content = normalize_line_endings(&raw_content);
                        let mut applied = 0;

                        for patch in &op.patches {
                            if file_content.contains(&patch.search) {
                                file_content = file_content.replace(&patch.search, &patch.replace);
                                applied += 1;
                                total_patches_applied += 1;
                            } else {
                                total_patches_failed += 1;
                            }
                        }

                        if applied > 0 && applied == op.patches.len() {
                            if let Err(e) = fs::write(&absolute_path, file_content) {
                                emit_event(
                                    app_handle,
                                    &op_id,
                                    &op.file,
                                    "modify",
                                    "error",
                                    &format!("Lỗi ghi file: {}", e),
                                );
                                total_ops_failed += 1;
                            } else {
                                emit_event(
                                    app_handle,
                                    &op_id,
                                    &op.file,
                                    "modify",
                                    "success",
                                    &format!("Đã cập nhật {} block", applied),
                                );
                                total_files_updated += 1;
                            }
                        } else if applied > 0 {
                            // Partial apply
                            if let Err(e) = fs::write(&absolute_path, file_content) {
                                emit_event(
                                    app_handle,
                                    &op_id,
                                    &op.file,
                                    "modify",
                                    "error",
                                    &format!("Lỗi ghi file: {}", e),
                                );
                                total_ops_failed += 1;
                            } else {
                                emit_event(
                                    app_handle,
                                    &op_id,
                                    &op.file,
                                    "modify",
                                    "error",
                                    &format!("Chỉ khớp {}/{} block", applied, op.patches.len()),
                                );
                                total_files_updated += 1;
                                total_ops_failed += 1;
                            }
                        } else {
                            emit_event(
                                app_handle,
                                &op_id,
                                &op.file,
                                "modify",
                                "error",
                                "Lỗi so khớp: Không tìm thấy block SEARCH nào",
                            );
                            total_ops_failed += 1;
                        }
                    }
                    Err(e) => {
                        emit_event(
                            app_handle,
                            &op_id,
                            &op.file,
                            "modify",
                            "error",
                            &format!("Lỗi đọc file: {}", e),
                        );
                        total_ops_failed += 1;
                    }
                }
            }
        }
    }

    let _ = app_handle.emit("patch_log", "=== TỔNG KẾT BẢN VÁ ===".to_string());
    let _ = app_handle.emit(
        "patch_log",
        format!(
            "Tạo mới: {} files, {} thư mục",
            total_files_created, total_dirs_created
        ),
    );
    let _ = app_handle.emit(
        "patch_log",
        format!(
            "Cập nhật: {} files ({} patch thành công)",
            total_files_updated, total_patches_applied
        ),
    );
    let _ = app_handle.emit(
        "patch_log",
        format!(
            "Đổi tên: {} files | Xóa: {} mục",
            total_files_renamed, total_files_deleted
        ),
    );

    if total_patches_failed > 0 || total_ops_failed > 0 {
        let _ = app_handle.emit("patch_task_error", ());
    } else {
        let _ = app_handle.emit("patch_task_success", ());
    }
}
