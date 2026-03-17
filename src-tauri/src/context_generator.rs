// src-tauri/src/context_generator.rs
use crate::models::{FileNode, FsEntry}; // <-- Thêm FileNode
use lazy_static::lazy_static;
use regex::Regex;
use std::collections::{BTreeMap, HashSet};
use std::fmt::Write as FmtWrite;
use std::fs;
use std::path::Path;

fn generate_dummy_logic(content: &str, file_rel_path: &str) -> String {
    let extension = std::path::Path::new(file_rel_path)
        .extension()
        .and_then(std::ffi::OsStr::to_str)
        .unwrap_or("")
        .to_lowercase();

    let c_style = [
        "ts", "js", "tsx", "jsx", "vue", "svelte", "cs", "java", "cpp", "c", "h", "hpp", "rs",
        "go", "php", "swift", "kt",
    ];

    let is_c_style = c_style.contains(&extension.as_str());

    if !is_c_style {
        // Đối với Python, Ruby, HTML thuần... thuật toán ngoặc nhọn không áp dụng tốt
        // Tạm thời trả về nguyên gốc để tránh phá hỏng code
        return content.to_string();
    }

    // Nén các đoạn UI tốn nhiều token nếu là file frontend
    let is_ui = ["tsx", "jsx", "vue", "svelte"].contains(&extension.as_str());
    let mut processed_content = content.to_string();
    if is_ui {
        processed_content = CLASSNAME_REGEX
            .replace_all(&processed_content, "className=\"...\"")
            .to_string();
        processed_content = CLASSNAME_TPL_REGEX
            .replace_all(&processed_content, "className={/*...*/}")
            .to_string();
        processed_content = CLASS_REGEX
            .replace_all(&processed_content, "class=\"...\"")
            .to_string();
        processed_content = SVG_REGEX
            .replace_all(&processed_content, "<svg>/* svg omitted */</svg>")
            .to_string();
    }

    // Loại bỏ comment trước khi phân tích để tránh ngoặc nhọn trong comment gây nhiễu trạng thái
    let clean_content = remove_comments_from_content(&processed_content, file_rel_path);

    let mut result = String::with_capacity(clean_content.len());
    let mut brace_depth = 0;
    let mut in_string = false;
    let mut string_char = ' ';
    let mut escape = false;

    let mut collapsed_stack = vec![false];
    let mut current_block_collapsed = false;
    let mut recent_chars = String::new();
    let mut prev_char = ' ';

    for c in clean_content.chars() {
        if escape {
            if !current_block_collapsed {
                result.push(c);
                recent_chars.push(c);
            }
            escape = false;
            prev_char = c;
            continue;
        }

        if c == '\\' && in_string {
            escape = true;
            if !current_block_collapsed {
                result.push(c);
                recent_chars.push(c);
            }
            prev_char = c;
            continue;
        }

        if (c == '"' || c == '\'' || c == '`') && !in_string {
            // Heuristic tránh lỗi parse chuỗi trong JSX text (vd: don't, It's)
            if c == '\'' && prev_char.is_alphanumeric() {
                if !current_block_collapsed {
                    result.push(c);
                    recent_chars.push(c);
                }
            } else {
                in_string = true;
                string_char = c;
                if !current_block_collapsed {
                    result.push(c);
                    recent_chars.push(c);
                }
            }
            prev_char = c;
            continue;
        } else if c == string_char && in_string {
            in_string = false;
            if !current_block_collapsed {
                result.push(c);
                recent_chars.push(c);
            }
            prev_char = c;
            continue;
        }

        if !in_string {
            if c == '{' {
                let pre_text = recent_chars.trim_end();

                let should_collapse =
                    if pre_text.ends_with("import") || pre_text.contains("import ") {
                        false
                    } else if (pre_text.ends_with("export") || pre_text.contains("export "))
                        && !pre_text.contains("=")
                        && !pre_text.contains(" default ")
                    {
                        false
                    } else if pre_text.contains("interface ")
                        || pre_text.contains("class ")
                        || pre_text.contains("struct ")
                        || pre_text.contains("enum ")
                        || pre_text.contains("trait ")
                        || pre_text.contains("impl ")
                        || pre_text.contains("namespace ")
                        || pre_text.contains("module ")
                        || pre_text.contains("type ")
                        || pre_text.contains("mod ")
                    {
                        false
                    } else if pre_text.ends_with(":")
                        || pre_text.ends_with("<")
                        || pre_text.ends_with("|")
                        || pre_text.ends_with("&")
                    {
                        false
                    } else {
                        // Mặc định ẩn để tiết kiệm token tối đa (chủ yếu là function body, object literal, v.v.)
                        true
                    };

                let will_collapse = current_block_collapsed || should_collapse;
                collapsed_stack.push(will_collapse);
                current_block_collapsed = will_collapse;
                brace_depth += 1;

                // Nếu block này bị ẩn, NHƯNG cha của nó KHÔNG bị ẩn, thì ta in ra `{ /* logic omitted */ `
                let parent_collapsed = if collapsed_stack.len() >= 2 {
                    collapsed_stack[collapsed_stack.len() - 2]
                } else {
                    false
                };

                if !parent_collapsed {
                    result.push(c);
                    if current_block_collapsed {
                        result.push_str(" /* logic omitted */ ");
                    }
                }

                recent_chars.clear();
                prev_char = c;
                continue;
            } else if c == '}' {
                let parent_collapsed = if collapsed_stack.len() >= 2 {
                    collapsed_stack[collapsed_stack.len() - 2]
                } else {
                    false
                };

                if brace_depth > 0 {
                    collapsed_stack.pop();
                    current_block_collapsed = *collapsed_stack.last().unwrap_or(&false);
                    brace_depth -= 1;
                }

                // Chỉ in ra `}` nếu cha không bị ẩn
                if !parent_collapsed {
                    result.push(c);
                }

                recent_chars.clear();
                prev_char = c;
                continue;
            } else if c == ';' {
                if !current_block_collapsed {
                    result.push(c);
                }
                recent_chars.clear(); // Reset ngữ cảnh keyword
                prev_char = c;
                continue;
            }
        }

        if !current_block_collapsed {
            result.push(c);
            recent_chars.push(c);
            if recent_chars.len() > 150 {
                let drained: String = recent_chars.chars().skip(50).collect();
                recent_chars = drained;
            }
        }
        prev_char = c;
    }

    // Xóa bớt khoảng trắng thừa sinh ra do lược bỏ code
    EMPTY_LINES_REGEX.replace_all(&result, "\n\n").to_string()
}

lazy_static! {
    static ref C_STYLE_SINGLE_LINE_COMMENT: Regex = Regex::new(r"//.*").unwrap();
    static ref C_STYLE_MULTI_LINE_COMMENT: Regex = Regex::new(r"(?s)/\*.*?\*/").unwrap();
    static ref HASH_COMMENT: Regex = Regex::new(r"#.*").unwrap();
    static ref HTML_XML_COMMENT: Regex = Regex::new(r"(?s)<!--.*?-->").unwrap();
    static ref SQL_LUA_COMMENT: Regex = Regex::new(r"--.*").unwrap();
    static ref VBNET_COMMENT: Regex = Regex::new(r"'.*").unwrap();
    static ref LISP_COMMENT: Regex = Regex::new(r";.*").unwrap();
    static ref ERLANG_COMMENT: Regex = Regex::new(r"%.*").unwrap();

    // Regex toàn diện để tìm các câu lệnh ghi log gỡ lỗi phổ biến trên nhiều ngôn ngữ
    static ref DEBUG_LOG_REGEX: Regex = Regex::new(concat!(
        r"(?im)^\s*(?:",
        r"console\.(?:log|warn|error|info|debug|trace|assert|dir|dirxml|table|time(?:End|Log)?|count(?:Reset)?|group(?:End|Collapsed)?|clear|profile(?:End)?)\s*\(.*\);?", // JS/TS
        r"|println!\s*\(.*\);?|dbg!\s*\(.*\);?", // Rust
        r"|print\s*\(.*\)", // Python, Swift
        r"|(?:var_dump|print_r)\s*\(.*\);?", // PHP
        r"|System\.out\.println\s*\(.*\);?", // Java
        r"|Console\.WriteLine\s*\(.*\);?", // C#
        r"|fmt\.Println\s*\(.*\)", // Go
        r"|(?:puts|p|pp)\s+.*", // Ruby
        r")\s*\r?\n?"
    )).unwrap();
    static ref WHITESPACE_REGEX: Regex = Regex::new(r"\s+").unwrap();

    // Regexes for UI compression
    static ref CLASSNAME_REGEX: Regex = Regex::new(r#"className="[^"]*""#).unwrap();
    static ref CLASSNAME_TPL_REGEX: Regex = Regex::new(r#"className=\{`[^`]*`\}"#).unwrap();
    static ref CLASS_REGEX: Regex = Regex::new(r#"class="[^"]*""#).unwrap();
    static ref SVG_REGEX: Regex = Regex::new(r#"(?s)<svg.*?>.*?</svg>"#).unwrap();

    // Nén các dòng trống
    static ref EMPTY_LINES_REGEX: Regex = Regex::new(r"\n\s*\n\s*\n+").unwrap();
}

fn remove_comments_from_content(content: &str, file_rel_path: &str) -> String {
    let extension = Path::new(file_rel_path)
        .extension()
        .and_then(std::ffi::OsStr::to_str)
        .unwrap_or("");

    let processed_content = match extension {
        // Chú thích kiểu C (// và /* */)
        "js" | "jsx" | "ts" | "tsx" | "rs" | "go" | "c" | "cpp" | "h" | "java" | "cs" | "swift"
        | "kt" | "css" | "scss" | "less" | "jsonc" | "glsl" | "dart" | "gd" => {
            let temp = C_STYLE_SINGLE_LINE_COMMENT.replace_all(content, "");
            C_STYLE_MULTI_LINE_COMMENT
                .replace_all(&temp, "")
                .to_string()
        }
        // Chú thích bằng dấu thăng (#)
        "py" | "rb" | "sh" | "yml" | "yaml" | "toml" | "dockerfile" | "gitignore" | "r" | "pl"
        | "pm" | "ps1" | "el" => HASH_COMMENT.replace_all(content, "").to_string(),
        // Chú thích kiểu HTML/XML (<!-- -->)
        "html" | "xml" | "svg" | "md" => HTML_XML_COMMENT.replace_all(content, "").to_string(),
        // Chú thích kiểu SQL/Lua (--)
        "sql" | "lua" | "hs" | "ada" => SQL_LUA_COMMENT.replace_all(content, "").to_string(),
        // Chú thích kiểu Lisp (;)
        "lisp" | "cl" | "scm" => LISP_COMMENT.replace_all(content, "").to_string(),
        // Chú thích kiểu Erlang (%)
        "erl" | "hrl" => ERLANG_COMMENT.replace_all(content, "").to_string(),
        // Chú thích kiểu VB (')
        "vb" | "vbs" => VBNET_COMMENT.replace_all(content, "").to_string(),
        // Ngôn ngữ hỗn hợp
        "php" => {
            let temp1 = C_STYLE_MULTI_LINE_COMMENT.replace_all(content, "");
            let temp2 = C_STYLE_SINGLE_LINE_COMMENT.replace_all(&temp1, "");
            HASH_COMMENT.replace_all(&temp2, "").to_string()
        }
        "vue" | "astro" => {
            let temp = HTML_XML_COMMENT.replace_all(content, "");
            let temp2 = C_STYLE_MULTI_LINE_COMMENT.replace_all(&temp, "");
            C_STYLE_SINGLE_LINE_COMMENT
                .replace_all(&temp2, "")
                .to_string()
        }
        _ => content.to_string(),
    };

    // Loại bỏ các dòng trống được tạo ra sau khi xóa comment
    processed_content
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn remove_debug_logs_from_content(content: &str) -> String {
    // Replace found debug logs with an empty string
    DEBUG_LOG_REGEX.replace_all(content, "").to_string()
}

fn compress_content_for_tree(content: &str) -> String {
    // Replace newlines and tabs with a single space, then collapse multiple spaces.
    let no_newlines = content.replace(['\n', '\r', '\t'], " ");
    WHITESPACE_REGEX
        .replace_all(&no_newlines, " ")
        .trim()
        .to_string()
}

fn format_tree(tree: &BTreeMap<String, FsEntry>, prefix: &str, output: &mut String) {
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
                format_tree(children, &new_prefix, output);
            }
        }
    }
}

fn format_tree_super_compressed(
    tree: &BTreeMap<String, FsEntry>,
    prefix: &str,
    current_path: &Path,
    root_path: &Path,
    output: &mut String,
    without_comments: bool,
    remove_debug_logs: bool,
    exclude_extensions_set: &HashSet<&str>,
) {
    let mut entries = tree.iter().peekable();
    while let Some((name, entry)) = entries.next() {
        let is_last = entries.peek().is_none();
        let connector = if is_last { "└── " } else { "├── " };
        let new_path = current_path.join(name);

        match entry {
            FsEntry::File => {
                let extension = new_path
                    .extension()
                    .and_then(std::ffi::OsStr::to_str)
                    .unwrap_or("");
                if !exclude_extensions_set.contains(extension) {
                    let full_path = root_path.join(&new_path);
                    let content_str = if let Ok(mut content) = fs::read_to_string(&full_path) {
                        let rel_path_str = new_path.to_string_lossy();
                        if without_comments {
                            content = remove_comments_from_content(&content, &rel_path_str);
                        }
                        if remove_debug_logs {
                            content = remove_debug_logs_from_content(&content);
                        }
                        format!("[{}]", compress_content_for_tree(&content))
                    } else {
                        "[KHÔNG THỂ ĐỌC FILE]".to_string()
                    };
                    let _ = writeln!(output, "{}{}{} {}", prefix, connector, name, content_str);
                } else {
                    let _ = writeln!(output, "{}{}{} [BỊ LOẠI TRỪ]", prefix, connector, name);
                }
            }
            FsEntry::Directory(children) => {
                let _ = writeln!(output, "{}{}{}/", prefix, connector, name);
                let new_prefix = format!("{}{}", prefix, if is_last { "    " } else { "│   " });
                format_tree_super_compressed(
                    children,
                    &new_prefix,
                    &new_path,
                    root_path,
                    output,
                    without_comments,
                    remove_debug_logs,
                    exclude_extensions_set,
                );
            }
        }
    }
}

// --- HÀM HELPER MỚI: Chuyển đổi từ FileNode (của cache) sang FsEntry (của builder) ---
fn convert_file_node_to_fs_entry(node: &FileNode) -> FsEntry {
    if let Some(children) = &node.children {
        let mut child_map = BTreeMap::new();
        for child in children {
            child_map.insert(child.name.clone(), convert_file_node_to_fs_entry(child));
        }
        FsEntry::Directory(child_map)
    } else {
        FsEntry::File
    }
}

// === BẮT ĐẦU PHẦN SỬA LỖI DỨT ĐIỂM ===
pub fn expand_group_paths_to_files(
    group_paths: &[String],
    metadata_cache: &BTreeMap<String, crate::models::FileMetadata>,
    _root_path: &Path, // Không cần truy cập đĩa nữa
) -> Vec<String> {
    let mut all_files_in_group: HashSet<String> = HashSet::new();

    // Lấy danh sách tất cả các file đã được quét để duyệt hiệu quả hơn
    let all_cached_files: Vec<&String> = metadata_cache.keys().collect();

    for path_str in group_paths {
        // Xử lý trường hợp đường dẫn đã lưu là MỘT FILE cụ thể
        // Ví dụ: path_str = "src/App.tsx"
        if metadata_cache.contains_key(path_str) {
            all_files_in_group.insert(path_str.clone());
        }

        // Xử lý trường hợp đường dẫn đã lưu là MỘT THƯ MỤC
        // Ví dụ: path_str = "src" -> tìm các file bắt đầu bằng "src/"
        let dir_prefix = format!("{}/", path_str);
        for &cached_file in &all_cached_files {
            // Nếu path_str là thư mục gốc ("") thì dir_prefix sẽ là "/"
            // và cached_file cũng sẽ bắt đầu bằng "/", điều này không đúng.
            // Do đó, cần xử lý trường hợp thư mục gốc một cách đặc biệt.
            if path_str.is_empty() {
                all_files_in_group.insert(cached_file.clone());
            } else if cached_file.starts_with(&dir_prefix) {
                all_files_in_group.insert(cached_file.clone());
            }
        }
    }

    all_files_in_group.into_iter().collect()
}
// === KẾT THÚC PHẦN SỬA LỖI DỨT ĐIỂM ===

// --- CẬP NHẬT CHỮ KÝ VÀ LOGIC CỦA HÀM NÀY ---
pub fn generate_context_from_files(
    root_path_str: &str,
    file_paths: &[String],
    use_full_tree: bool,
    full_project_tree: &Option<FileNode>,
    export_only_tree: bool,
    with_line_numbers: bool,
    without_comments: bool,
    remove_debug_logs: bool,
    super_compressed: bool,
    always_apply_text: &Option<String>,
    exclude_extensions: &Option<Vec<String>>,
    metadata_cache: &BTreeMap<String, crate::models::FileMetadata>,
    export_claude_mode: bool,
    export_dummy_logic: bool,
) -> Result<String, String> {
    let root_path = Path::new(root_path_str);
    let mut tree_builder_root = BTreeMap::new();

    // --- LOGIC IF/ELSE MỚI ĐỂ XÂY DỰNG CÂY THƯ MỤC ---
    if use_full_tree {
        if let Some(tree_node) = full_project_tree {
            if let FsEntry::Directory(root_children) = convert_file_node_to_fs_entry(tree_node) {
                tree_builder_root = root_children;
            }
        } else {
            return Err("Không tìm thấy cây thư mục đầy đủ trong cache.".to_string());
        }
    } else {
        // Giữ lại logic cũ để xây dựng cây thư mục tối giản
        for rel_path_str in file_paths {
            let rel_path = Path::new(rel_path_str);
            let mut current_level = &mut tree_builder_root;
            if let Some(components) = rel_path.parent() {
                for component in components.components() {
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
                current_level.insert(file_name_str, FsEntry::File);
            }
        }
    }

    let exclude_set: HashSet<_> = exclude_extensions
        .as_ref()
        .map(|v| v.iter().map(|s| s.as_str()).collect())
        .unwrap_or_default();

    let mut directory_structure = String::new();

    if export_only_tree {
        format_tree(&tree_builder_root, "", &mut directory_structure);
        let final_context_with_suffix = format!("Directory structure:\n{}", directory_structure);

        let mut final_context = final_context_with_suffix;
        if let Some(text) = always_apply_text {
            if !text.trim().is_empty() {
                let _ = writeln!(
                    final_context,
                    "\n================================================"
                );
                let _ = writeln!(final_context, "**ALWAYS APPLY**");
                let _ = writeln!(
                    final_context,
                    "================================================"
                );
                let _ = writeln!(final_context, "{}", text);
            }
        }
        return Ok(final_context);
    }

    let final_context = if export_claude_mode {
        let mut sections: BTreeMap<String, Vec<String>> = BTreeMap::new();
        let mut total_files = 0;
        let mut files_content_map: BTreeMap<String, String> = BTreeMap::new();

        let mut sorted_files = file_paths.to_vec();
        sorted_files.sort();

        let final_files: Vec<_> = sorted_files
            .into_iter()
            .filter(|file_rel_path| {
                let extension = Path::new(file_rel_path)
                    .extension()
                    .and_then(std::ffi::OsStr::to_str)
                    .unwrap_or("");
                !exclude_set.contains(extension)
            })
            .collect();

        for file_rel_path in final_files {
            let file_path = root_path.join(&file_rel_path);
            if let Ok(mut content) = fs::read_to_string(&file_path) {
                if let Some(metadata) = metadata_cache.get(&file_rel_path) {
                    if let Some(ranges) = &metadata.excluded_ranges {
                        if !ranges.is_empty() {
                            let mut final_content = String::with_capacity(content.len());
                            let mut last_index = 0;
                            for (start, end) in ranges {
                                if *start >= last_index {
                                    final_content.push_str(&content[last_index..*start]);
                                }
                                last_index = *end;
                            }
                            if last_index < content.len() {
                                final_content.push_str(&content[last_index..]);
                            }
                            content = final_content;
                        }
                    }
                }

                if export_dummy_logic {
                    content = generate_dummy_logic(&content, &file_rel_path);
                }
                if without_comments {
                    content = remove_comments_from_content(&content, &file_rel_path);
                }
                if remove_debug_logs {
                    content = remove_debug_logs_from_content(&content);
                }

                let parent_dir = Path::new(&file_rel_path)
                    .parent()
                    .unwrap_or(Path::new(""))
                    .to_string_lossy()
                    .to_string();
                let section_name = if parent_dir.is_empty() {
                    "root".to_string()
                } else {
                    parent_dir
                };

                files_content_map.insert(file_rel_path.clone(), content);
                sections
                    .entry(section_name)
                    .or_default()
                    .push(file_rel_path.clone());
                total_files += 1;
            }
        }

        // Bước 1: Render các sections trước để đếm exctly số dòng
        let mut sections_out = String::new();
        let mut file_start_lines: BTreeMap<String, usize> = BTreeMap::new();
        let mut current_relative_line = 0;

        for (section, files) in sections.iter() {
            let section_header = format!("===SECTION: {}===\n\n", section);
            sections_out.push_str(&section_header);
            current_relative_line += section_header.matches('\n').count();

            for file_rel_path in files {
                let content = &files_content_map[file_rel_path];
                let ext = Path::new(file_rel_path)
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("");
                let lines = content.lines().count();
                let size_kb = content.len() as f64 / 1024.0;
                let size_kb_rounded = (size_kb * 100.0).round() / 100.0;

                // Ghi nhận vị trí bắt đầu của file này
                file_start_lines.insert(file_rel_path.clone(), current_relative_line);

                let file_header = format!(
                    "#FILE {} {} {} {}kb\n",
                    file_rel_path, ext, lines, size_kb_rounded
                );
                sections_out.push_str(&file_header);
                current_relative_line += 1;

                if with_line_numbers {
                    for (i, line) in content.lines().enumerate() {
                        let line_str = format!("{}: {}\n", i + 1, line);
                        sections_out.push_str(&line_str);
                        current_relative_line += 1;
                    }
                } else {
                    if !content.is_empty() {
                        sections_out.push_str(content);
                        current_relative_line += content.matches('\n').count();
                        if !content.ends_with('\n') {
                            sections_out.push('\n');
                            current_relative_line += 1;
                        }
                    }
                }

                let file_footer = "#ENDFILE\n\n";
                sections_out.push_str(file_footer);
                current_relative_line += 2;
            }
            let section_footer = "===ENDSECTION===\n\n";
            sections_out.push_str(section_footer);
            current_relative_line += 2;
        }

        // Bước 2: Tạo dummy manifest với line_start = 0 để tính toán độ dài phần Header (theo dòng)
        let mut dummy_entries = Vec::new();
        for files in sections.values() {
            for file_rel_path in files {
                let content = &files_content_map[file_rel_path];
                let ext = Path::new(file_rel_path)
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("");
                let lines = content.lines().count();
                let size_kb = content.len() as f64 / 1024.0;
                dummy_entries.push(serde_json::json!({
                    "file": file_rel_path,
                    "lang": ext,
                    "lines": lines,
                    "size_kb": (size_kb * 100.0).round() / 100.0,
                    "line_start": 0
                }));
            }
        }

        let dummy_manifest = serde_json::json!({
            "project": root_path.file_name().unwrap_or_default().to_string_lossy(),
            "total_files": total_files,
            "sections": sections.keys().collect::<Vec<_>>(),
            "index": dummy_entries
        });

        let dummy_json = serde_json::to_string_pretty(&dummy_manifest).unwrap_or_default();
        let dummy_prefix = format!(
            "===MANIFEST_START===\n{}\n===MANIFEST_END===\n\n",
            dummy_json
        );
        let prefix_line_count = dummy_prefix.matches('\n').count();

        // Bước 3: Build real manifest với line_start đã được map chuẩn xác
        let mut real_entries = Vec::new();
        for files in sections.values() {
            for file_rel_path in files {
                let content = &files_content_map[file_rel_path];
                let ext = Path::new(file_rel_path)
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("");
                let lines = content.lines().count();
                let size_kb = content.len() as f64 / 1024.0;
                let relative_start = file_start_lines.get(file_rel_path).unwrap_or(&0);

                real_entries.push(serde_json::json!({
                    "file": file_rel_path,
                    "lang": ext,
                    "lines": lines,
                    "size_kb": (size_kb * 100.0).round() / 100.0,
                    "line_start": prefix_line_count + relative_start + 1
                }));
            }
        }

        let final_manifest = serde_json::json!({
            "project": root_path.file_name().unwrap_or_default().to_string_lossy(),
            "total_files": total_files,
            "sections": sections.keys().collect::<Vec<_>>(),
            "index": real_entries
        });

        let final_json = serde_json::to_string_pretty(&final_manifest).unwrap_or_default();
        let mut final_out = format!(
            "===MANIFEST_START===\n{}\n===MANIFEST_END===\n\n",
            final_json
        );
        final_out.push_str(&sections_out);
        final_out
    } else if super_compressed {
        format_tree_super_compressed(
            &tree_builder_root,
            "",
            Path::new(""),
            root_path,
            &mut directory_structure,
            without_comments,
            remove_debug_logs,
            &exclude_set,
        );
        format!("Directory structure:\n{}", directory_structure)
    } else {
        format_tree(&tree_builder_root, "", &mut directory_structure);

        let mut file_contents_string = String::new();
        let mut sorted_files = file_paths.to_vec();
        sorted_files.sort();

        let final_files: Vec<_> = sorted_files
            .into_iter()
            .filter(|file_rel_path| {
                let extension = Path::new(file_rel_path)
                    .extension()
                    .and_then(std::ffi::OsStr::to_str)
                    .unwrap_or("");
                !exclude_set.contains(extension)
            })
            .collect();

        for file_rel_path in final_files {
            let file_path = root_path.join(&file_rel_path);
            if let Ok(mut content) = fs::read_to_string(&file_path) {
                // --- NEW LOGIC: APPLY EXCLUSIONS FIRST ---
                if let Some(metadata) = metadata_cache.get(&file_rel_path) {
                    if let Some(ranges) = &metadata.excluded_ranges {
                        if !ranges.is_empty() {
                            let mut final_content = String::with_capacity(content.len());
                            let mut last_index = 0;
                            for (start, end) in ranges {
                                if *start >= last_index {
                                    final_content.push_str(&content[last_index..*start]);
                                }
                                last_index = *end;
                            }
                            if last_index < content.len() {
                                final_content.push_str(&content[last_index..]);
                            }
                            content = final_content;
                        }
                    }
                }

                let mut processed_content = content;

                if export_dummy_logic {
                    processed_content = generate_dummy_logic(&processed_content, &file_rel_path);
                }

                if without_comments {
                    processed_content =
                        remove_comments_from_content(&processed_content, &file_rel_path);
                }

                if remove_debug_logs {
                    processed_content = remove_debug_logs_from_content(&processed_content);
                }

                let header = format!("================================================\nFILE: {}\n================================================\n", file_rel_path.replace("\\", "/"));
                file_contents_string.push_str(&header);
                if with_line_numbers {
                    for (i, line) in processed_content.lines().enumerate() {
                        let _ = writeln!(file_contents_string, "{}: {}", i + 1, line);
                    }
                } else {
                    file_contents_string.push_str(&processed_content);
                }
                file_contents_string.push_str("\n\n");
            }
        }
        format!(
            "Directory structure:\n{}\n\n{}",
            directory_structure, file_contents_string
        )
    };

    let mut final_context_with_suffix = final_context;

    if let Some(text) = always_apply_text {
        if !text.trim().is_empty() {
            let _ = writeln!(
                final_context_with_suffix,
                "\n================================================"
            );
            let _ = writeln!(final_context_with_suffix, "**ALWAYS APPLY**");
            let _ = writeln!(
                final_context_with_suffix,
                "================================================"
            );
            let _ = writeln!(final_context_with_suffix, "{}", text);
        }
    }

    Ok(final_context_with_suffix)
}
