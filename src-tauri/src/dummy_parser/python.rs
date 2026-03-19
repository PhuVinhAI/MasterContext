use lazy_static::lazy_static;
use regex::Regex;

lazy_static! {
    static ref EMPTY_LINES_REGEX: Regex = Regex::new(r"\n\s*\n\s*\n+").unwrap();
}

pub fn parse(content: &str) -> String {
    let mut result = String::with_capacity(content.len());
    let mut lines = content.lines().peekable();

    // Lưu trữ mức thụt lề (indentation) của hàm đang được phân tích
    let mut inside_def_indent: Option<usize> = None;
    // Cờ đánh dấu khi signature của hàm trải dài trên nhiều dòng
    let mut in_multiline_signature = false;

    while let Some(line) = lines.next() {
        let stripped = line.trim_start();
        let indent = line.len() - stripped.len();

        // Bỏ qua dòng trống nếu đang ở trong body hàm để code gọn hơn
        if stripped.is_empty() && inside_def_indent.is_some() {
            continue;
        }

        // Lấy nội dung dòng không bao gồm comment để bắt chính xác dấu `:`
        let line_without_comment = line.split('#').next().unwrap_or("").trim_end();

        if in_multiline_signature {
            result.push_str(line);
            result.push('\n');
            // Nếu dòng kết thúc bằng `:` thì signature đã hoàn thành
            if line_without_comment.ends_with(':') {
                in_multiline_signature = false;
                let base_indent = inside_def_indent.unwrap_or(0);
                result.push_str(&" ".repeat(base_indent + 4));
                result.push_str("pass\n");
            }
            continue;
        }

        if let Some(def_indent) = inside_def_indent {
            if indent > def_indent {
                // Vẫn đang lùi lề sâu hơn def -> đang trong body của hàm -> skip
                continue;
            } else {
                // Đã thoát khỏi body của hàm
                inside_def_indent = None;
            }
        }

        // Xử lý các dòng bên ngoài body hàm
        if stripped.starts_with("def ") || stripped.starts_with("async def ") {
            result.push_str(line);
            result.push('\n');

            if line_without_comment.ends_with(':') {
                // Hàm chuẩn (signature kết thúc ngay trên 1 dòng)
                result.push_str(&" ".repeat(indent + 4));
                result.push_str("pass\n");
                inside_def_indent = Some(indent);
            } else if line_without_comment.contains(':') {
                // Hàm 1 dòng kiểu: def foo(): pass (Không làm gì thêm)
            } else {
                // Hàm có signature trải dài nhiều dòng
                in_multiline_signature = true;
                inside_def_indent = Some(indent);
            }
        } else {
            // Các thành phần khác (class, biến module, import...) giữ nguyên
            result.push_str(line);
            result.push('\n');
        }
    }

    EMPTY_LINES_REGEX.replace_all(&result, "\n\n").trim().to_string()
}