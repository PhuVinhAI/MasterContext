// src-tauri/src/project_scanner.rs
use crate::group_updater;
use crate::models::{CachedProjectData, FileMetadata, FileNode, ProjectStats};
use ignore::{overrides::OverrideBuilder, WalkBuilder};
use lazy_static::lazy_static;
use num_cpus;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Arc};
use std::thread;
use std::time::UNIX_EPOCH;
use tauri::{Emitter, Window};

lazy_static! {
    // Define sets for files/extensions to skip during content analysis.
    // These files will still be listed, but we won't read their content,
    // count tokens, or analyze dependencies, saving significant time.

    static ref NON_ANALYZABLE_FILENAMES: HashSet<String> = [
        "Cargo.lock", "yarn.lock", "pnpm-lock.yaml",
    ].iter().map(|s| s.to_string()).collect();
}

pub struct ScanOptions {
    pub user_non_analyzable_extensions: Option<Vec<String>>,
    pub user_non_analyzable_folders: Option<Vec<String>>,
}

pub fn perform_smart_scan_and_rebuild(
    window: &Window,
    path: &str,
    old_data: CachedProjectData,
    options: ScanOptions,
) -> Result<(CachedProjectData, bool, Vec<PathBuf>), String> {
    let root_path = Path::new(path);

    // Dữ liệu cũ giờ được truyền vào trực tiếp, không cần đọc từ file ở đây
    // --- PHÁT HIỆN LẦN QUÉT ĐẦU TIÊN ---
    let is_first_scan = old_data.file_metadata_cache.is_empty();
    let old_metadata_cache = Arc::new(old_data.file_metadata_cache);

    let mut new_project_stats = ProjectStats::default();
    let mut new_metadata_cache = BTreeMap::new();
    let mut path_map = BTreeMap::new(); // Dùng để xây dựng cây thư mục

    // --- CHỈ SỬ DỤNG CÀI ĐẶT CỦA NGƯỜI DÙNG ---
    let final_non_analyzable_extensions: HashSet<String> = options
        .user_non_analyzable_extensions
        .unwrap_or_default()
        .into_iter()
        .collect();

    let final_non_analyzable_folders: Vec<String> = options
        .user_non_analyzable_folders
        .unwrap_or_default()
        .into_iter()
        .map(|s| s.trim().trim_matches('/').to_string()) // Xóa dấu gạch chéo dư thừa
        .filter(|s| !s.is_empty())
        .collect();
    // --- KẾT THÚC THAY ĐỔI ---

    // --- CẬP NHẬT: Xây dựng bộ lọc loại trừ ---
    let override_builder = {
        let mut builder = OverrideBuilder::new(root_path);
        // Luôn bao gồm các file lock
        builder
            .add("!package-lock.json")
            .map_err(|e| e.to_string())?;
        builder.add("!Cargo.lock").map_err(|e| e.to_string())?;
        builder.add("!yarn.lock").map_err(|e| e.to_string())?;
        builder.add("!pnpm-lock.yaml").map_err(|e| e.to_string())?;

        // Thêm các mẫu loại trừ tùy chỉnh từ người dùng
        if let Some(patterns) = &old_data.custom_ignore_patterns {
            for pattern in patterns {
                // Thêm tiền tố '!' để chỉ định đây là mẫu LOẠI TRỪ
                let ignore_pattern = format!("!{}", pattern);
                builder.add(&ignore_pattern).map_err(|e| e.to_string())?;
            }
        }

        builder.build().map_err(|e| e.to_string())?
    };

    // --- BƯỚC 1 & 2: Quét thư mục nhanh (bỏ qua đếm token các file mới/bị đổi) ---
    let mut files_to_analyze: Vec<PathBuf> = Vec::new();
    let mut total_files = 0;

    for entry in WalkBuilder::new(root_path)
        .overrides(override_builder.clone())
        .build()
        .filter_map(Result::ok)
    {
        if let Ok(metadata) = entry.metadata() {
            let entry_path = entry.into_path();
            path_map.insert(entry_path.clone(), metadata.is_dir());

            if metadata.is_file() {
                total_files += 1;
                if let Ok(relative_path) = entry_path.strip_prefix(root_path) {
                    let relative_path_str = relative_path
                        .to_string_lossy()
                        .to_string()
                        .replace("\\", "/");

                    if total_files % 100 == 0 {
                        // Giảm thiểu số lần emit để tăng tốc UI
                        let _ = window.emit("scan_progress", &relative_path_str);
                    }

                    let filename = relative_path
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("");
                    let extension = relative_path
                        .extension()
                        .and_then(|s| s.to_str())
                        .unwrap_or("");

                    let mut should_skip_analysis = NON_ANALYZABLE_FILENAMES.contains(filename)
                        || final_non_analyzable_extensions.contains(extension);

                    // Kiểm tra xem file có nằm trong thư mục cần bỏ qua phân tích không
                    if !should_skip_analysis {
                        let path_parts: Vec<&str> = relative_path_str.split('/').collect();
                        for folder in &final_non_analyzable_folders {
                            if path_parts.contains(&folder.as_str()) {
                                should_skip_analysis = true;
                                break;
                            }
                        }
                    }

                    let current_mtime = metadata
                        .modified()
                        .map(|t| t.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs())
                        .unwrap_or(0);

                    let mut token_count = 0;
                    let mut excluded_ranges = None;

                    // Kiểm tra cache
                    if let Some(cached_meta) = old_metadata_cache.get(&relative_path_str) {
                        if cached_meta.size == metadata.len() && cached_meta.mtime == current_mtime
                        {
                            token_count = cached_meta.token_count;
                            excluded_ranges = cached_meta.excluded_ranges.clone();
                        }
                    }

                    if token_count == 0 && !should_skip_analysis {
                        files_to_analyze.push(entry_path.clone());
                    } else if token_count == 0 && should_skip_analysis {
                        token_count = 1; // File bỏ qua phân tích gán 1 token
                    }

                    let file_meta = FileMetadata {
                        size: metadata.len(),
                        mtime: current_mtime,
                        token_count,
                        excluded_ranges,
                    };

                    new_project_stats.total_size += file_meta.size;
                    new_project_stats.total_tokens += token_count; // Sẽ update thêm sau ở background
                    new_metadata_cache.insert(relative_path_str, file_meta);
                }
            }
        }
    }

    new_project_stats.total_files = total_files as u64;
    new_project_stats.total_dirs = path_map.values().filter(|&&is_dir| is_dir).count() as u64;

    // --- BƯỚC 3: Xây dựng cây thư mục và cập nhật nhóm ---
    fn build_tree_from_map(
        parent: &Path,
        path_map: &BTreeMap<PathBuf, bool>,
        root_path: &Path,
    ) -> Vec<FileNode> {
        let mut children = Vec::new();
        for (path, is_dir) in path_map.range(parent.join("")..) {
            if path.parent() == Some(parent) {
                let name = path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                let relative_path_str = path
                    .strip_prefix(root_path)
                    .unwrap()
                    .to_string_lossy()
                    .replace("\\", "/");
                children.push(FileNode {
                    name,
                    path: relative_path_str,
                    children: if *is_dir {
                        Some(build_tree_from_map(path, path_map, root_path))
                    } else {
                        None
                    },
                });
            }
        }
        children.sort_by(|a, b| {
            let a_is_dir = a.children.is_some();
            let b_is_dir = b.children.is_some();
            if a_is_dir != b_is_dir {
                b_is_dir.cmp(&a_is_dir)
            } else {
                a.name.cmp(&b.name)
            }
        });
        children
    }
    let root_children = build_tree_from_map(root_path, &path_map, root_path);
    let file_tree = FileNode {
        name: root_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        path: "".to_string(),
        children: Some(root_children),
    };

    let mut updated_groups = old_data.groups;
    group_updater::update_groups_after_scan(
        &mut updated_groups,
        &new_metadata_cache,
        &path_map,
        root_path,
    );

    // --- BƯỚC 5: Tính toán hash để theo dõi thay đổi ---
    let metadata_json = serde_json::to_string(&new_metadata_cache).unwrap_or_default();
    let mut hasher = Sha256::new();
    hasher.update(metadata_json.as_bytes());
    let hash_result = hasher.finalize();
    let data_hash = format!("{:x}", hash_result);

    let final_data = CachedProjectData {
        stats: new_project_stats,
        file_tree: Some(file_tree),
        groups: updated_groups,
        file_metadata_cache: new_metadata_cache,
        sync_enabled: old_data.sync_enabled, // Giữ lại cài đặt cũ
        sync_path: old_data.sync_path,       // Giữ lại cài đặt cũ
        data_hash: Some(data_hash),
        custom_ignore_patterns: old_data.custom_ignore_patterns, // Giữ lại cài đặt cũ
        is_watching_files: old_data.is_watching_files,           // Giữ lại cài đặt cũ
        export_use_full_tree: old_data.export_use_full_tree,     // Giữ lại cài đặt cũ
        export_only_tree: old_data.export_only_tree,
        export_with_line_numbers: old_data.export_with_line_numbers, // Giữ lại cài đặt cũ
        export_without_comments: old_data.export_without_comments,   // Giữ lại cài đặt cũ
        export_remove_debug_logs: old_data.export_remove_debug_logs, // Giữ lại cài đặt cũ
        export_super_compressed: old_data.export_super_compressed,
        export_claude_mode: old_data.export_claude_mode,
        export_dummy_logic: old_data.export_dummy_logic,
        always_apply_text: old_data.always_apply_text,
        append_ide_prompt: old_data.append_ide_prompt,
        append_group_prompt: old_data.append_group_prompt,
        export_exclude_extensions: old_data.export_exclude_extensions,
        git_export_mode_is_context: old_data.git_export_mode_is_context,
    };

    // --- THAY ĐỔI: Trả về dữ liệu thay vì lưu và emit ---
    Ok((final_data, is_first_scan, files_to_analyze))
}

pub fn run_background_analysis(
    window: &Window,
    root_path_str: &str,
    files_to_analyze: Vec<PathBuf>,
    project_data: &mut CachedProjectData,
) {
    let root_path = Path::new(root_path_str);
    let num_workers = num_cpus::get();
    let (tx, rx) = mpsc::channel::<(String, usize)>();
    let (job_tx, job_rx) = mpsc::channel::<PathBuf>();
    let job_rx = Arc::new(std::sync::Mutex::new(job_rx));

    let mut worker_handles = Vec::new();

    for _ in 0..num_workers {
        let rx = Arc::clone(&job_rx);
        let tx = tx.clone();
        let root_path = root_path.to_path_buf();
        let window = window.clone();

        let handle = thread::spawn(move || {
            while let Ok(absolute_path) = rx.lock().unwrap().recv() {
                let relative_path = absolute_path.strip_prefix(&root_path).unwrap();
                let relative_path_str = relative_path.to_string_lossy().replace("\\", "/");

                let _ = window.emit("analysis_progress", &relative_path_str);

                let mut token_count = 1;
                if let Ok(content) = fs::read_to_string(&absolute_path) {
                    let char_count = content.chars().count();
                    token_count = (char_count as f64 / 4.0).ceil() as usize;
                    if char_count > 0 && token_count == 0 {
                        token_count = 1;
                    }
                }

                tx.send((relative_path_str, token_count)).unwrap();
            }
        });
        worker_handles.push(handle);
    }

    let num_jobs = files_to_analyze.len();
    for job in files_to_analyze {
        job_tx.send(job).unwrap();
    }
    drop(job_tx);

    let mut batch = std::collections::HashMap::new();
    for _ in 0..num_jobs {
        let (rel_path, tokens) = rx.recv().unwrap();

        if let Some(meta) = project_data.file_metadata_cache.get_mut(&rel_path) {
            meta.token_count = tokens;
        }
        project_data.stats.total_tokens += tokens;

        batch.insert(rel_path, tokens);
        if batch.len() >= 50 {
            let _ = window.emit(
                "file_token_update_batch",
                serde_json::json!({ "updates": batch }),
            );
            batch.clear();
        }
    }
    if !batch.is_empty() {
        let _ = window.emit(
            "file_token_update_batch",
            serde_json::json!({ "updates": batch }),
        );
    }

    for handle in worker_handles {
        handle.join().unwrap();
    }

    // Update group stats since token counts changed
    for group in &mut project_data.groups {
        group.stats = crate::group_updater::recalculate_stats_for_paths(
            &group.paths,
            &project_data.file_metadata_cache,
            root_path,
        );
    }

    // Re-hash
    let metadata_json =
        serde_json::to_string(&project_data.file_metadata_cache).unwrap_or_default();
    let mut hasher = Sha256::new();
    hasher.update(metadata_json.as_bytes());
    project_data.data_hash = Some(format!("{:x}", hasher.finalize()));
}
