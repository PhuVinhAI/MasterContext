// src-tauri/src/commands/utils.rs
use crate::{context_generator, models};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

pub fn get_ide_prompt(app: &tauri::AppHandle) -> String {
    let resource_dir = match app.path().resource_dir() {
        Ok(dir) => dir,
        Err(_) => return String::new(),
    };
    let path1 = resource_dir.join("resources").join("code.md");
    let path2 = resource_dir.join("_up_").join("resources").join("code.md");
    let path3 = resource_dir.join("code.md");
    let path4 = std::path::PathBuf::from("../resources").join("code.md");

    std::fs::read_to_string(&path1)
        .or_else(|_| std::fs::read_to_string(&path2))
        .or_else(|_| std::fs::read_to_string(&path3))
        .or_else(|_| std::fs::read_to_string(&path4))
        .unwrap_or_default()
}

pub fn build_always_apply_text(
    app: &tauri::AppHandle,
    custom_text: &Option<String>,
    append_ide: bool,
) -> Option<String> {
    let mut final_text = String::new();
    if let Some(text) = custom_text {
        final_text.push_str(text);
    }
    if append_ide {
        let ide_prompt = get_ide_prompt(app);
        if !ide_prompt.is_empty() {
            if !final_text.is_empty() {
                final_text.push_str("\n\n");
            }
            final_text.push_str(&ide_prompt);
        }
    }
    if final_text.is_empty() {
        None
    } else {
        Some(final_text)
    }
}

pub fn sanitize_group_name(name: &str) -> String {
    name.replace(|c: char| !c.is_alphanumeric(), "_")
}

fn save_context_to_path_internal(path: String, content: String) -> Result<(), String> {
    let file_path = Path::new(&path);
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Không thể tạo thư mục cha: {}", e))?;
    }
    fs::write(file_path, content).map_err(|e| format!("Không thể ghi vào file: {}", e))
}

pub fn perform_auto_export(
    app: &tauri::AppHandle,
    project_path: &str,
    _profile_name: &str,
    data: &models::CachedProjectData,
) {
    let sync_path_base = PathBuf::from(data.sync_path.as_ref().unwrap());
    let use_full_tree = data.export_use_full_tree.unwrap_or(false);
    let export_only_tree = data.export_only_tree.unwrap_or(false);
    let with_line_numbers = data.export_with_line_numbers.unwrap_or(true);
    let without_comments = data.export_without_comments.unwrap_or(false);
    let remove_debug_logs = data.export_remove_debug_logs.unwrap_or(false);
    let super_compressed = data.export_super_compressed.unwrap_or(false);
    let export_dummy_logic = data.export_dummy_logic.unwrap_or(false);
    let final_always_apply_text = build_always_apply_text(
        app,
        &data.always_apply_text,
        data.append_ide_prompt.unwrap_or(false),
    );
    let exclude_extensions = &data.export_exclude_extensions;
    let all_files: Vec<String> = data.file_metadata_cache.keys().cloned().collect();

    if let Ok(proj_context) = context_generator::generate_context_from_files(
        project_path,
        &all_files,
        use_full_tree,
        &data.file_tree,
        export_only_tree,
        with_line_numbers,
        without_comments,
        remove_debug_logs,
        super_compressed,
        &final_always_apply_text,
        exclude_extensions,
        &data.file_metadata_cache,
        data.export_claude_mode.unwrap_or(false),
        export_dummy_logic,
    ) {
        let file_name = sync_path_base.join("_PROJECT_CONTEXT.txt");
        let _ =
            save_context_to_path_internal(file_name.to_string_lossy().to_string(), proj_context);
    }

    for group in &data.groups {
        let expanded_files = context_generator::expand_group_paths_to_files(
            &group.paths,
            &data.file_metadata_cache,
            Path::new(project_path),
        );
        if !expanded_files.is_empty() {
            if let Ok(group_context) = context_generator::generate_context_from_files(
                project_path,
                &expanded_files,
                use_full_tree,
                &data.file_tree,
                export_only_tree,
                with_line_numbers,
                without_comments,
                remove_debug_logs,
                super_compressed,
                &final_always_apply_text,
                exclude_extensions,
                &data.file_metadata_cache,
                data.export_claude_mode.unwrap_or(false),
                export_dummy_logic,
            ) {
                let safe_name = sanitize_group_name(&group.name);
                let file_name = sync_path_base.join(format!("{}_context.txt", safe_name));
                let _ = save_context_to_path_internal(
                    file_name.to_string_lossy().to_string(),
                    group_context,
                );
            }
        }
    }
}
