pub mod cpp;
pub mod c_style;
pub mod vue;

pub fn process(clean_content: &str, file_rel_path: &str) -> String {
    let extension = std::path::Path::new(file_rel_path)
        .extension()
        .and_then(std::ffi::OsStr::to_str)
        .unwrap_or("")
        .to_lowercase();

    match extension.as_str() {
        // Bỏ qua hoàn toàn nội dung các file tĩnh / tài nguyên / giao diện thuần túy trong chế độ Dummy
        "svg" | "json" | "md" | "css" | "scss" | "less" | "html" => {
            "// [STATIC OR UI ASSET EXCLUDED IN DUMMY MODE]".to_string()
        }
        // Chuyên trị các trường hợp biên của C/C++ (Header inline, struct array, 1-line if...)
        "c" | "cpp" | "h" | "hpp" | "cc" | "cxx" | "m" | "mm" => {
            cpp::parse(clean_content)
        }
        // Tách riêng các UI Framework (Vue, Svelte, Astro) để vứt bỏ hoàn toàn thẻ <template> / <style>
        "vue" | "svelte" | "astro" => {
            vue::parse(clean_content, &extension)
        }
        // Các ngôn ngữ C-Style cơ bản (JS, TS, C#, Java, Rust...)
        "ts" | "js" | "tsx" | "jsx" | "cs" | "java" | "rs" | "go" | "php" | "swift" | "kt" => {
            c_style::parse(clean_content, &extension)
        }
        _ => clean_content.to_string(),
    }
}