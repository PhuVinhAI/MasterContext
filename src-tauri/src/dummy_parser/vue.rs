use regex::Regex;
use lazy_static::lazy_static;
use crate::dummy_parser::c_style;

lazy_static! {
    // Regex lấy toàn bộ thẻ <script> bao gồm cả các attribute (như setup, lang="ts")
    static ref SCRIPT_REGEX: Regex = Regex::new(r"(?is)<script([^>]*)>(.*?)</script>").unwrap();
}

pub fn parse(content: &str, _extension: &str) -> String {
    let mut result = String::new();

    // Tìm tất cả các block <script> trong file UI (Vue, Svelte, Astro)
    for cap in SCRIPT_REGEX.captures_iter(content) {
        let attributes = cap.get(1).map_or("", |m| m.as_str());
        let inner_code = cap.get(2).map_or("", |m| m.as_str());

        // Đưa phần code TS/JS bên trong qua c_style parser để gọt bỏ thân hàm/object lớn
        let collapsed_code = c_style::parse(inner_code, "ts");

        result.push_str(&format!("<script{}>\n{}\n</script>\n\n", attributes, collapsed_code.trim()));
    }

    if result.is_empty() {
        return "// [NO SCRIPT TAG FOUND - UI CONTENT HIDDEN]".to_string();
    }

    result.trim().to_string()
}