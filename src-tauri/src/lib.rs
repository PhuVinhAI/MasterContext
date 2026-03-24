// src-tauri/src/lib.rs

// Khai báo các module
pub mod commands;
pub mod git_utils;
pub mod group_updater;
mod context_generator;
pub mod dummy_parser;
mod file_cache;
mod models;
mod project_scanner;
mod kilo_server;
mod patch_server;
mod patch_executor;

use std::sync::{Arc, Mutex};
use tauri::Manager;
pub struct ActiveProjectState(pub Arc<Mutex<Option<String>>>);

// State quản lý việc bật tắt server
pub struct KiloServerHandle(pub Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>);
pub struct KiloModelState(pub Arc<Mutex<String>>);
pub struct KiloAbortSignal(pub Arc<std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>>);

pub struct PatchServerHandle(pub Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>);
pub struct PatchFixState(pub Arc<Mutex<Option<tokio::sync::oneshot::Sender<Option<patch_executor::SearchReplace>>>>>);
pub struct PatchAbortSignal(pub Arc<std::sync::atomic::AtomicBool>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let active_project = Arc::new(Mutex::new(None));
    let kilo_handle = Arc::new(Mutex::new(None));
    let kilo_model = Arc::new(Mutex::new(String::new()));
    let kilo_abort = Arc::new(std::sync::Mutex::new(None));
    let patch_handle = Arc::new(Mutex::new(None));
    let patch_fix_state = Arc::new(Mutex::new(None));
    let patch_abort = Arc::new(std::sync::atomic::AtomicBool::new(false));

    tauri::Builder::default()
        .manage(ActiveProjectState(active_project))
        .manage(KiloServerHandle(kilo_handle))
        .manage(KiloModelState(kilo_model))
        .manage(KiloAbortSignal(kilo_abort))
        .manage(PatchServerHandle(patch_handle))
        .manage(PatchFixState(patch_fix_state))
        .manage(PatchAbortSignal(patch_abort))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            // THAY THẾ DÒNG NÀY
            // commands::open_project,
            commands::scan_project, // <-- COMMAND MỚI
            commands::delete_project_data,
            commands::load_profile_data, // <-- COMMAND MỚI
            // ... (các command còn lại)
            commands::get_file_content,
            commands::read_file_with_lines,
            commands::save_file_content,
            commands::create_file,
            commands::rename_file,
            commands::create_directory,
            commands::apply_search_replace,
            commands::replace_file_lines,
            commands::apply_multiple_search_replace,
            commands::execute_terminal_command,
            commands::delete_file,
            commands::update_groups_in_project_data,
            commands::start_group_update,
            commands::start_group_export,
            commands::start_project_export,
            commands::calculate_group_stats_from_cache,
            commands::generate_directory_tree,
            commands::update_file_exclusions,
            commands::generate_group_context_for_ai,
            commands::update_sync_settings,
            commands::generate_group_context,
            commands::generate_project_context,
            commands::generate_dummy_project_context_for_ai,
            commands::update_custom_ignore_patterns,
            // Các command mới để quản lý hồ sơ
            commands::list_profiles,
            commands::create_profile,
            commands::delete_profile,
            commands::rename_profile,
            commands::set_file_watching_setting,
            commands::start_file_watching,
            commands::stop_file_watching,
            commands::list_groups_for_profile,
            commands::clone_profile,
            commands::set_export_use_full_tree_setting,
            commands::set_export_only_tree_setting,
            commands::set_export_with_line_numbers_setting,
            commands::set_export_without_comments_setting, // <-- COMMAND MỚI
            commands::set_export_remove_debug_logs_setting, // <-- COMMAND MỚI
            commands::set_export_super_compressed_setting,
            commands::set_export_claude_mode_setting, // <-- COMMAND MỚI
            commands::set_export_dummy_logic_setting,
            commands::get_expanded_files_for_group,
            commands::update_group_paths_from_ai,
            commands::set_export_exclude_extensions_setting, // <-- COMMAND MỚI
            commands::set_always_apply_text_setting,
            commands::set_append_ide_prompt_setting,
            commands::set_append_group_prompt_setting,
            commands::set_append_kilo_prompt_setting,
            commands::get_app_settings,
            commands::set_recent_paths,
            commands::update_app_settings, // <-- COMMAND MỚI
            commands::get_resource_file_content,
            commands::check_git_repository,
            commands::get_git_branches,
            commands::reset_and_force_push,
            commands::get_git_commits, // SỬA LỖI: Thiếu dấu phẩy
            commands::get_commit_diff,
            commands::generate_commit_context,
            commands::set_git_export_mode_setting,
            commands::checkout_commit,
            commands::checkout_branch,
            commands::clone_git_repository,
            commands::get_git_status,
            // AI Chat History Commands
            commands::list_chat_sessions,
            commands::save_chat_session,
            commands::load_chat_session,
            commands::delete_chat_session,
            commands::update_chat_session_title,
            commands::create_chat_session,
            commands::delete_all_chat_sessions,
            // Kilo Server Commands
            kilo_server::start_kilo_server,
            kilo_server::stop_kilo_server,
            kilo_server::get_kilo_server_status,
            kilo_server::check_kilo_installed,
            kilo_server::install_kilo_cli,
            kilo_server::get_kilo_models,
            kilo_server::init_kilo_config,
            kilo_server::open_extension_folder,
            kilo_server::set_kilo_model,
            // Patch Server Commands
            patch_server::start_patch_server,
            patch_server::stop_patch_server,
            patch_server::get_patch_server_status,
            patch_executor::submit_patch_fix
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            tauri::RunEvent::ExitRequested { .. } => {
                let abort_state = app_handle.state::<KiloAbortSignal>();
                if let Some(tx) = abort_state.0.lock().unwrap().take() {
                    let _ = tx.send(());
                }

                let state = app_handle.state::<KiloServerHandle>();
                if let Some(tx) = state.0.lock().unwrap().take() {
                    let _ = tx.send(());
                };

                let patch_state = app_handle.state::<PatchServerHandle>();
                if let Some(tx) = patch_state.0.lock().unwrap().take() {
                    let _ = tx.send(());
                };
            }
            _ => {}
        });
}
