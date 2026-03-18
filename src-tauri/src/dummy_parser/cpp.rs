#[derive(Debug, PartialEq, Clone, Copy)]
pub enum ScopeType {
    Keep,  // Giữ lại nội dung bên trong (dành cho class, struct, namespace, enum...)
    Strip, // Xóa hoàn toàn nội dung bên trong (dành cho hàm, constructor, lambda...)
}

pub fn parse(content: &str) -> String {
    let mut result = String::with_capacity(content.len());
    let chars: Vec<char> = content.chars().collect();
    let len = chars.len();

    let mut scope_stack: Vec<ScopeType> = Vec::new();
    let mut in_string = false;
    let mut string_char = '\0';
    let mut escape = false;
    let mut paren_depth = 0;

    // Buffer theo dõi các từ khoá trước khi mở một scope mới
    let mut statement_buffer = String::new();

    let mut i = 0;
    while i < len {
        let c = chars[i];

        if escape {
            if !is_stripping(&scope_stack) { result.push(c); }
            statement_buffer.push(c);
            escape = false;
            i += 1;
            continue;
        }
        if c == '\\' {
            escape = true;
            if !is_stripping(&scope_stack) { result.push(c); }
            statement_buffer.push(c);
            i += 1;
            continue;
        }

        // Xử lý chuỗi để không đếm nhầm ngoặc nhọn
        if c == '"' || c == '\'' || c == '`' {
            if !in_string {
                in_string = true;
                string_char = c;
            } else if c == string_char {
                in_string = false;
            }
            if !is_stripping(&scope_stack) { result.push(c); }
            statement_buffer.push(c);
            i += 1;
            continue;
        }

        if !in_string {
            if c == '(' {
                paren_depth += 1;
            } else if c == ')' {
                if paren_depth > 0 { paren_depth -= 1; }
            }

            if c == '{' {
                let is_keep = determine_if_keep_scope(&statement_buffer, paren_depth);
                let scope = if is_keep { ScopeType::Keep } else { ScopeType::Strip };

                if !is_stripping(&scope_stack) {
                    result.push('{');
                    if scope == ScopeType::Strip {
                        result.push_str(" ... ");
                    }
                }
                scope_stack.push(scope);
                statement_buffer.clear(); // Reset buffer cho scope mới
                i += 1;
                continue;
            } else if c == '}' {
                let popped = scope_stack.pop();

                if popped == Some(ScopeType::Strip) {
                    // Nếu thoát khỏi hàm, và bản thân cha nó không bị strip -> in ra }
                    if !is_stripping(&scope_stack) {
                        result.push('}');
                    }
                } else if popped == Some(ScopeType::Keep) {
                    // Thoát khỏi class/struct
                    if !is_stripping(&scope_stack) {
                        result.push('}');
                    }
                }

                statement_buffer.clear();
                i += 1;
                continue;
            } else if c == ';' {
                if !is_stripping(&scope_stack) { result.push(c); }
                statement_buffer.clear();
                i += 1;
                continue;
            } else if c == ':' {
                // Các keyword như public:, private: không nên làm sạch buffer
                // để giữ lại ngữ cảnh class khai báo thừa kế
            }
        }

        // Chỉ khi không nằm trong một hàm/scope bị Strip, chúng ta mới in ký tự này ra file cuối
        if !is_stripping(&scope_stack) {
            result.push(c);
        }

        // Lưu buffer, loại bỏ khoảng trắng thừa để tối ưu regex check
        if !c.is_whitespace() {
            statement_buffer.push(c);
        } else if !statement_buffer.ends_with(' ') {
            statement_buffer.push(' ');
        }

        i += 1;
    }

    // Xóa các dòng trống thừa
    lazy_static::lazy_static! {
        static ref EMPTY_LINES_REGEX: regex::Regex = regex::Regex::new(r"\n\s*\n\s*\n+").unwrap();
    }
    EMPTY_LINES_REGEX.replace_all(&result, "\n\n").to_string()
}

#[inline]
fn is_stripping(stack: &[ScopeType]) -> bool {
    stack.contains(&ScopeType::Strip)
}

fn determine_if_keep_scope(buffer: &str, paren_depth: usize) -> bool {
    if paren_depth > 0 {
        return false; // Lambda, initializer lists, v.v. -> STRIP
    }

    // Làm sạch buffer bằng cách loại bỏ toàn bộ nội dung nằm trong (...) và <...>
    // Giúp loại bỏ các keyword "class", "struct" bị kẹt trong template args hoặc params.
    let mut clean_buf = String::with_capacity(buffer.len());
    let mut p_depth = 0;
    let mut a_depth = 0;

    for c in buffer.chars() {
        match c {
            '(' => p_depth += 1,
            ')' => if p_depth > 0 { p_depth -= 1 },
            '<' => a_depth += 1,
            '>' => if a_depth > 0 { a_depth -= 1 },
            _ => {
                if p_depth == 0 && a_depth == 0 {
                    clean_buf.push(c);
                }
            }
        }
    }

    // Tokenize phần buffer đã được làm sạch
    let tokens: Vec<&str> = clean_buf
        .split(|c: char| !c.is_alphanumeric() && c != '_')
        .filter(|s| !s.is_empty())
        .collect();

    // Nếu sau khi xóa params & template args, bên ngoài vẫn còn các keyword cấu trúc -> KEEP
    for t in &tokens {
        if matches!(
            *t,
            "class" | "struct" | "namespace" | "enum" | "union" | "interface" | "concept"
        ) {
            return true;
        }
    }

    // Xử lý đặc biệt cho `extern "C" {` (Không có params -> KEEP)
    // Nhưng `extern "C" void foo() {` (Có params trong original buffer -> STRIP)
    if buffer.contains("extern") && !buffer.contains(')') {
        return true;
    }

    // Mọi thứ khác (Hàm, if, while, for, switch, try, catch...) -> STRIP
    false
}