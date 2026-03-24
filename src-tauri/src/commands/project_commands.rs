// src-tauri/src/commands/project_commands.rs
use super::start_file_watching;
use super::utils::perform_auto_export;
use crate::models::FsEntry;
use crate::{context_generator, file_cache, models, project_scanner};
use ignore::WalkBuilder;
use std::collections::BTreeMap;
use std::fmt::Write as FmtWrite;
use std::fs;
use std::path::Path;
use tauri::{command, AppHandle, Emitter, Manager, Window}; // Add models

#[command]
pub fn scan_project(
    window: Window,
    path: String,
    profile_name: String,
    state: tauri::State<'_, crate::ActiveProjectState>,
) {
    // Cập nhật đường dẫn dự án hiện tại cho Kilo Web Server biết
    *state.0.lock().unwrap() = Some(path.clone());

    let window_clone = window.clone();
    let path_clone = path.clone();
    let app = window.app_handle().clone();

    std::thread::spawn(move || {
        let old_data =
            file_cache::load_project_data(&app, &path, &profile_name).unwrap_or_default();
        let should_start_watching = old_data.is_watching_files.unwrap_or(false);

        // --- THÊM LOGIC ĐỌC CÀI ĐẶT ---
        // Lấy cài đặt ứng dụng để truyền vào scanner
        let app_settings =
            super::settings_commands::get_app_settings(app.clone()).unwrap_or_default();

        match project_scanner::perform_smart_scan_and_rebuild(
            &window,
            &path,
            old_data,
            project_scanner::ScanOptions {
                user_non_analyzable_extensions: app_settings.non_analyzable_extensions,
                user_non_analyzable_folders: app_settings.non_analyzable_folders,
            },
        ) {
            Ok((mut new_data, is_first_scan, files_to_analyze)) => {
                // Trả về giao diện ngay lập tức cấu trúc cây để user thao tác
                let _ = window.emit(
                    "scan_complete",
                    serde_json::json!({
                        "projectData": new_data,
                        "isFirstScan": is_first_scan
                    }),
                );

                if !files_to_analyze.is_empty() {
                    // Chạy background đếm token các file chưa có trong cache
                    project_scanner::run_background_analysis(&window, &path, files_to_analyze, &mut new_data);
                    let _ = window.emit("analysis_completed", ());
                }

                // Lưu lại cache cuối cùng sau khi phân tích background xong (nếu có)
                if let Err(e) = file_cache::save_project_data(&app, &path, &profile_name, &new_data) {
                    let _ = window.emit("scan_error", e);
                    return;
                }

                if new_data.sync_enabled.unwrap_or(false) && new_data.sync_path.is_some() {
                    perform_auto_export(&app, &path, &profile_name, &new_data);
                }

                if should_start_watching {
                    if let Err(e) = start_file_watching(window_clone, path_clone) {
                        println!("[Error] Auto-starting watcher failed: {}", e);
                    }
                }
            }
            Err(e) => {
                let _ = window.emit("scan_error", e);
            }
        }
    });
}

#[command]
pub fn start_project_export(window: Window, app: AppHandle, path: String, profile_name: String) {
    std::thread::spawn(move || {
        let result: Result<String, String> = (|| {
            let project_data = file_cache::load_project_data(&app, &path, &profile_name)?;
            let use_full_tree = project_data.export_use_full_tree.unwrap_or(false);
            let export_only_tree = project_data.export_only_tree.unwrap_or(false);
            let with_line_numbers = project_data.export_with_line_numbers.unwrap_or(true);
            let without_comments = project_data.export_without_comments.unwrap_or(false);
            let remove_debug_logs = project_data.export_remove_debug_logs.unwrap_or(false);
            let super_compressed = project_data.export_super_compressed.unwrap_or(false);
            let export_claude_mode = project_data.export_claude_mode.unwrap_or(false);
            let export_dummy_logic = project_data.export_dummy_logic.unwrap_or(false);
            let final_always_apply_text = crate::commands::utils::build_always_apply_text(
                &app,
                &project_data.always_apply_text,
                project_data.append_ide_prompt.unwrap_or(false),
                project_data.append_group_prompt.unwrap_or(false),
                project_data.append_kilo_prompt.unwrap_or(false),
            );
            let exclude_extensions = project_data.export_exclude_extensions;
            let all_files: Vec<String> = project_data.file_metadata_cache.keys().cloned().collect();
            if all_files.is_empty() {
                return Err("project.export_no_files".to_string());
            }
            context_generator::generate_context_from_files(
                &path,
                &all_files,
                use_full_tree,
                &project_data.file_tree,
                export_only_tree,
                with_line_numbers,
                without_comments,
                remove_debug_logs,
                super_compressed,
                &final_always_apply_text,
                &exclude_extensions,
                &project_data.file_metadata_cache,
                export_claude_mode,
                export_dummy_logic,
            )
        })();
        match result {
            Ok(context) => {
                let _ = window.emit("project_export_complete", context);
            }
            Err(e) => {
                let _ = window.emit("project_export_error", e);
            }
        }
    });
}

#[command]
pub fn generate_dummy_project_context_for_ai(
    app: AppHandle,
    path: String,
    profile_name: String,
) -> Result<String, String> {
    let project_data = file_cache::load_project_data(&app, &path, &profile_name)?;
    let exclude_extensions = project_data.export_exclude_extensions;
    let all_files: Vec<String> = project_data.file_metadata_cache.keys().cloned().collect();
    if all_files.is_empty() {
        return Err("project.generate_context_no_files".to_string());
    }
    context_generator::generate_context_from_files(
        &path,
        &all_files,
        false, // use_full_tree
        &project_data.file_tree,
        false, // export_only_tree
        true,  // with_line_numbers
        true,  // without_comments
        true,  // remove_debug_logs
        false, // super_compressed
        &None, // always_apply_text
        &exclude_extensions,
        &project_data.file_metadata_cache,
        false, // export_claude_mode
        true,  // export_dummy_logic
    )
}

#[command]
pub fn generate_project_context(
    app: AppHandle,
    path: String,
    profile_name: String,
    export_only_tree: bool,
    with_line_numbers: bool,
    without_comments: bool,
    remove_debug_logs: bool,
    super_compressed: bool,
) -> Result<String, String> {
    let project_data = file_cache::load_project_data(&app, &path, &profile_name)?;
    let use_full_tree = project_data.export_use_full_tree.unwrap_or(false);
    let export_claude_mode = project_data.export_claude_mode.unwrap_or(false);
    let export_dummy_logic = project_data.export_dummy_logic.unwrap_or(false);
    let final_always_apply_text = crate::commands::utils::build_always_apply_text(
        &app,
        &project_data.always_apply_text,
        project_data.append_ide_prompt.unwrap_or(false),
        project_data.append_group_prompt.unwrap_or(false),
        project_data.append_kilo_prompt.unwrap_or(false),
    );
    let exclude_extensions = project_data.export_exclude_extensions;
    let all_files: Vec<String> = project_data.file_metadata_cache.keys().cloned().collect();
    if all_files.is_empty() {
        return Err("project.generate_context_no_files".to_string());
    }
    context_generator::generate_context_from_files(
        &path,
        &all_files,
        use_full_tree,
        &project_data.file_tree,
        export_only_tree,
        with_line_numbers,
        without_comments,
        remove_debug_logs,
        super_compressed,
        &final_always_apply_text,
        &exclude_extensions,
        &project_data.file_metadata_cache,
        export_claude_mode,
        export_dummy_logic,
    )
}

#[command]
pub fn delete_project_data(app: AppHandle, path: String) -> Result<(), String> {
    let project_config_dir = file_cache::get_project_config_dir(&app, &path)?;
    if project_config_dir.exists() {
        fs::remove_dir_all(&project_config_dir)
            .map_err(|e| format!("Không thể xóa dữ liệu dự án: {}", e))?;
    }
    Ok(())
}

#[command]
pub fn get_file_content(root_path_str: String, file_rel_path: String) -> Result<String, String> {
    let root_path = std::path::Path::new(&root_path_str);
    let full_path = root_path.join(file_rel_path);
    fs::read_to_string(full_path).map_err(|e| format!("Không thể đọc file: {}", e))
}

#[command]
pub fn read_file_with_lines(
    root_path_str: String,
    file_rel_path: String,
    start_line: Option<usize>,
    end_line: Option<usize>,
) -> Result<String, String> {
    let root_path = std::path::Path::new(&root_path_str);
    let full_path = root_path.join(&file_rel_path);
    let content = fs::read_to_string(full_path)
        .map_err(|e| format!("Không thể đọc file '{}': {}", file_rel_path, e))?;

    if start_line.is_none() && end_line.is_none() {
        return Ok(content);
    }

    let lines: Vec<&str> = content.lines().collect();
    let total_lines = lines.len();

    // Line numbers from AI are 1-based, convert to 0-based index
    let start_index = start_line.map_or(0, |n| n.saturating_sub(1));
    let end_index = end_line.map_or(total_lines, |n| n).min(total_lines);

    if start_index >= end_index {
        return Ok("".to_string());
    }

    Ok(lines[start_index..end_index].join("\n"))
}

#[command]
pub fn save_file_content(
    root_path_str: String,
    file_rel_path: String,
    content: String,
) -> Result<(), String> {
    let root_path = std::path::Path::new(&root_path_str);
    let full_path = root_path.join(file_rel_path);
    if let Some(parent_dir) = full_path.parent() {
        fs::create_dir_all(parent_dir).map_err(|e| format!("Không thể tạo thư mục cha: {}", e))?;
    }
    fs::write(full_path, content).map_err(|e| format!("Không thể ghi file: {}", e))
}
#[command]
pub fn generate_directory_tree(
    root_path_str: String,
    dir_rel_path: String,
) -> Result<String, String> {
    let root_path = Path::new(&root_path_str);
    let full_dir_path = root_path.join(&dir_rel_path);

    if !full_dir_path.is_dir() {
        return Err(format!("'{}' không phải là một thư mục.", dir_rel_path));
    }

    let mut tree_builder_root = BTreeMap::new();

    // Sử dụng ignore::WalkBuilder để tôn trọng các file .gitignore
    for result in WalkBuilder::new(&full_dir_path).build().skip(1) {
        // bỏ qua thư mục gốc
        let entry = result.map_err(|e| e.to_string())?;
        let path = entry.path();

        // Lấy đường dẫn tương đối so với thư mục đang quét
        let rel_path = path
            .strip_prefix(&full_dir_path)
            .map_err(|e| e.to_string())?;

        let mut current_level = &mut tree_builder_root;

        if let Some(parent_components) = rel_path.parent() {
            for component in parent_components.components() {
                let component_str = component.as_os_str().to_string_lossy().into_owned();
                current_level = match current_level
                    .entry(component_str)
                    .or_insert(FsEntry::Directory(BTreeMap::new()))
                {
                    FsEntry::Directory(children) => children,
                    _ => unreachable!(),
                };
            }
        }

        if let Some(file_name) = rel_path.file_name() {
            let file_name_str = file_name.to_string_lossy().into_owned();
            if path.is_dir() {
                current_level
                    .entry(file_name_str)
                    .or_insert(FsEntry::Directory(BTreeMap::new()));
            } else {
                current_level.insert(file_name_str, FsEntry::File);
            }
        }
    }

    // Hàm helper để định dạng cây, có thể đã tồn tại ở nơi khác
    fn format_tree_helper(tree: &BTreeMap<String, FsEntry>, prefix: &str, output: &mut String) {
        let mut entries = tree.iter().peekable();
        while let Some((name, entry)) = entries.next() {
            let is_last = entries.peek().is_none();
            let connector = if is_last { "└── " } else { "├── " };
            match entry {
                FsEntry::File => {
                    let _ = writeln!(output, "{}{}{}", prefix, connector, name);
                }
                FsEntry::Directory(children) => {
                    let _ = writeln!(output, "{}{}{}/", prefix, connector, name);
                    let new_prefix = format!("{}{}", prefix, if is_last { "    " } else { "│   " });
                    format_tree_helper(children, &new_prefix, output);
                }
            }
        }
    }

    let mut directory_structure = String::new();
    format_tree_helper(&tree_builder_root, "", &mut directory_structure);

    let root_name = Path::new(&dir_rel_path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy();
    Ok(format!("{}/\n{}", root_name, directory_structure))
}
#[command]
pub fn create_file(
    root_path_str: String,
    file_rel_path: String,
    content: String,
) -> Result<(), String> {
    let root_path = std::path::Path::new(&root_path_str);
    let full_path = root_path.join(&file_rel_path);
    if let Some(parent_dir) = full_path.parent() {
        fs::create_dir_all(parent_dir).map_err(|e| format!("Không thể tạo thư mục cha: {}", e))?;
    }
    fs::write(full_path, content).map_err(|e| format!("Không thể tạo file: {}", e))
}

#[command]
pub fn rename_file(
    root_path_str: String,
    old_rel_path: String,
    new_rel_path: String,
) -> Result<(), String> {
    let root_path = std::path::Path::new(&root_path_str);
    let old_path = root_path.join(old_rel_path);
    let new_path = root_path.join(new_rel_path);

    if let Some(parent_dir) = new_path.parent() {
        fs::create_dir_all(parent_dir).map_err(|e| format!("Không thể tạo thư mục cha: {}", e))?;
    }

    fs::rename(old_path, new_path).map_err(|e| format!("Không thể đổi tên/di chuyển: {}", e))
}

#[command]
pub fn create_directory(root_path_str: String, dir_rel_path: String) -> Result<(), String> {
    let root_path = std::path::Path::new(&root_path_str);
    let full_path = root_path.join(dir_rel_path);
    fs::create_dir_all(full_path).map_err(|e| format!("Không thể tạo thư mục: {}", e))
}

#[command]
pub fn delete_file(root_path_str: String, file_rel_path: String) -> Result<(), String> {
    let root_path = Path::new(&root_path_str);
    let full_path = root_path.join(file_rel_path);
    if full_path.exists() {
        if full_path.is_dir() {
            fs::remove_dir_all(full_path).map_err(|e| format!("Không thể xóa thư mục: {}", e))
        } else {
            fs::remove_file(full_path).map_err(|e| format!("Không thể xóa file: {}", e))
        }
    } else {
        Ok(()) // File/Thư mục không tồn tại, coi như đã xóa thành công
    }
}

#[command]
pub fn apply_search_replace(
    root_path_str: String,
    file_rel_path: String,
    search_text: String,
    replace_text: String,
) -> Result<(), String> {
    let root_path = Path::new(&root_path_str);
    let full_path = root_path.join(file_rel_path);

    if !full_path.exists() {
        return Err("File does not exist".into());
    }

    let content = fs::read_to_string(&full_path).map_err(|e| e.to_string())?;

    if !content.contains(&search_text) {
        return Err(
            "Search block not found in file. Ensure exact matching including whitespaces.".into(),
        );
    }

    let new_content = content.replacen(&search_text, &replace_text, 1);
    fs::write(full_path, new_content).map_err(|e| e.to_string())
}

#[command]
pub fn replace_file_lines(
    root_path_str: String,
    file_rel_path: String,
    start_line: usize,
    end_line: usize,
    new_content: String,
) -> Result<(), String> {
    let root_path = Path::new(&root_path_str);
    let full_path = root_path.join(&file_rel_path);

    if !full_path.exists() {
        return Err("File does not exist".into());
    }

    let content = fs::read_to_string(&full_path).map_err(|e| e.to_string())?;
    // Chuẩn hóa xuống dòng để xử lý mảng
    let normalized_content = content.replace("\r\n", "\n").replace('\r', "\n");
    let lines: Vec<&str> = normalized_content.split('\n').collect();

    // Hệ thống tính từ 1, mảng tính từ 0
    let start_idx = if start_line > 0 { start_line - 1 } else { 0 };
    let end_idx = if end_line > 0 { end_line - 1 } else { 0 };

    if start_idx > lines.len() || start_idx > end_idx {
        return Err("Khoảng dòng (Line range) cung cấp không hợp lệ".into());
    }

    let end_idx_clamped = std::cmp::min(end_idx, lines.len().saturating_sub(1));

    let mut new_lines = Vec::new();
    new_lines.extend_from_slice(&lines[..start_idx]);
    new_lines.push(new_content.as_str());
    if end_idx_clamped + 1 < lines.len() {
        new_lines.extend_from_slice(&lines[end_idx_clamped + 1..]);
    }

    let final_content = new_lines.join("\n");
    fs::write(full_path, final_content).map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
pub struct SearchReplaceBlock {
    pub search: String,
    pub replace: String,
}

#[command]
pub fn apply_multiple_search_replace(
    root_path_str: String,
    file_rel_path: String,
    blocks: Vec<SearchReplaceBlock>,
) -> Result<(), String> {
    let root_path = Path::new(&root_path_str);
    let full_path = root_path.join(file_rel_path);

    if !full_path.exists() {
        return Err("File does not exist".into());
    }

    let mut content = fs::read_to_string(&full_path).map_err(|e| e.to_string())?;

    for (i, block) in blocks.iter().enumerate() {
        let clean_content = content.replace("\r\n", "\n").replace('\r', "\n");
        let clean_search = block.search.replace("\r\n", "\n").replace('\r', "\n");

        if !clean_content.contains(&clean_search) {
            return Err(format!("Block sửa đổi thứ {} không khớp mã nguồn. Đảm bảo copy đúng từng khoảng trắng và thụt lề.", i + 1));
        }
        content = clean_content.replace(&clean_search, &block.replace);
    }

    fs::write(full_path, content).map_err(|e| e.to_string())
}

#[command]
pub async fn execute_terminal_command(root_path_str: String, command: String) -> Result<String, String> {
    let root_path = Path::new(&root_path_str);

    use tokio::process::Command;
    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = Command::new("cmd");
        let full_cmd = format!("chcp 65001 > nul & {}", command);
        c.args(&["/C", &full_cmd]);
        #[cfg(target_os = "windows")]
        c.creation_flags(0x08000000); // Ẩn cửa sổ cmd đen
        c
    } else {
        let mut c = Command::new("sh");
        c.arg("-c").arg(&command);
        c
    };

    cmd.current_dir(root_path);

    // Đã bỏ Timeout theo yêu cầu người dùng
    match cmd.output().await {
        Ok(output) => {
            let mut result = String::new();
            let stdout_str = String::from_utf8_lossy(&output.stdout);
            let stderr_str = String::from_utf8_lossy(&output.stderr);

            result.push_str(&format!("Exit Code: {}\n", output.status.code().unwrap_or(-1)));
            if !stdout_str.trim().is_empty() {
                result.push_str("--- STDOUT ---\n");
                result.push_str(&stdout_str.chars().take(15000).collect::<String>());
                if stdout_str.len() > 15000 {
                    result.push_str("\n... (truncated)");
                }
                result.push_str("\n");
            }
            if !stderr_str.trim().is_empty() {
                result.push_str("--- STDERR ---\n");
                result.push_str(&stderr_str.chars().take(5000).collect::<String>());
                if stderr_str.len() > 5000 {
                    result.push_str("\n... (truncated)");
                }
                result.push_str("\n");
            }

            Ok(result)
        }
        Err(e) => Err(format!("Lỗi khởi chạy tiến trình: {}", e)),
    }
}

#[command]
pub fn glob_search(root_path_str: String, pattern: String) -> Result<Vec<String>, String> {
    let mut results = Vec::new();
    let root = Path::new(&root_path_str);
    
    // Sử dụng OverrideBuilder để áp dụng glob pattern chuẩn của thư viện ignore
    let mut override_builder = ignore::overrides::OverrideBuilder::new(root);
    if let Err(e) = override_builder.add(&pattern) {
        return Err(format!("Mẫu glob không hợp lệ: {}", e));
    }
    let overrides = override_builder.build().map_err(|e| e.to_string())?;

    let walker = ignore::WalkBuilder::new(root)
        .overrides(overrides)
        .hidden(false)
        .build();

    for result in walker.filter_map(Result::ok) {
        if result.path().is_file() {
            if let Ok(rel_path) = result.path().strip_prefix(root) {
                results.push(rel_path.to_string_lossy().replace("\\", "/"));
                if results.len() >= 100 { break; }
            }
        }
    }
    Ok(results)
}

#[command]
pub fn grep_search(root_path_str: String, pattern: String) -> Result<Vec<String>, String> {
    let mut results = Vec::new();
    let root = Path::new(&root_path_str);
    let re = regex::Regex::new(&pattern).map_err(|e| format!("Lỗi Regex: {}", e))?;
    
    let walker = ignore::WalkBuilder::new(root)
        .hidden(false)
        .build();

    for result in walker.filter_map(Result::ok) {
        if result.path().is_file() {
            if let Ok(content) = fs::read_to_string(result.path()) {
                if let Ok(rel_path) = result.path().strip_prefix(root) {
                    let rel_path_str = rel_path.to_string_lossy().replace("\\", "/");
                    for (i, line) in content.lines().enumerate() {
                        if re.is_match(line) {
                            let truncated_line = if line.len() > 2000 {
                                format!("{}...", &line[..2000])
                            } else {
                                line.to_string()
                            };
                            results.push(format!("{}|{}|{}", rel_path_str, i + 1, truncated_line.trim()));
                            if results.len() >= 100 { break; }
                        }
                    }
                }
            }
        }
        if results.len() >= 100 { break; }
    }
    Ok(results)
}

#[command]
pub fn update_file_exclusions(
    app: AppHandle,
    path: String,
    profile_name: String,
    file_rel_path: String,
    ranges: Vec<(usize, usize)>,
) -> Result<models::FileMetadata, String> {
    let mut project_data = file_cache::load_project_data(&app, &path, &profile_name)?;

    let updated_metadata: models::FileMetadata;

    if let Some(metadata) = project_data.file_metadata_cache.get_mut(&file_rel_path) {
        metadata.excluded_ranges = if ranges.is_empty() {
            None
        } else {
            Some(ranges)
        };
        updated_metadata = metadata.clone();
    } else {
        // This case should ideally not happen if the frontend is correct
        return Err(format!(
            "File '{}' not found in metadata cache.",
            file_rel_path
        ));
    }

    file_cache::save_project_data(&app, &path, &profile_name, &project_data)?;

    Ok(updated_metadata)
}
