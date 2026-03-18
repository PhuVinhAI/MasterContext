pub mod cpp;
pub mod c_style;

pub fn process(clean_content: &str, file_rel_path: &str) -> String {
    let extension = std::path::Path::new(file_rel_path)
        .extension()
        .and_then(std::ffi::OsStr::to_str)
        .unwrap_or("")
        .to_lowercase();

    match extension.as_str() {
        // Chuyên trị các trường hợp biên của C/C++ (Header inline, struct array, 1-line if...)
        "c" | "cpp" | "h" | "hpp" | "cc" | "cxx" | "m" | "mm" => {
            cpp::parse(clean_content)
        }
        // Các ngôn ngữ C-Style cơ bản (JS, TS, C#, Java, Rust...)
        "ts" | "js" | "tsx" | "jsx" | "vue" | "svelte" | "cs" | "java" | "rs" | "go" | "php" | "swift" | "kt" => {
            c_style::parse(clean_content, &extension)
        }
        _ => clean_content.to_string(),
    }
}