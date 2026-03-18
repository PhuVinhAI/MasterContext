#[derive(Debug, PartialEq, Clone, Copy)]
enum ScopeType {
    Keep,  // Giữ lại nội dung bên trong (dành cho class, struct, enum, namespace, interface, trait, impl...)
    Strip, // Xóa sạch 100% nội dung bên trong (dành cho hàm, block lệnh rẽ nhánh, block khởi tạo...)
}

pub fn process_c_style_dummy(clean_content: &str) -> String {
    let mut result = String::with_capacity(clean_content.len());
    let mut scope_stack: Vec<ScopeType> = Vec::new();
    let mut declaration_buffer = String::new();

    let chars: Vec<char> = clean_content.chars().collect();
    let mut i = 0;
    let len = chars.len();

    let mut in_string = false;
    let mut string_char = '\0';
    let mut escape = false;

    while i < len {
        let c = chars[i];

        // Xử lý Escape sequence (ví dụ: \")
        if escape {
            if !is_stripping(&scope_stack) {
                result.push(c);
            }
            declaration_buffer.push(c);
            escape = false;
            i += 1;
            continue;
        }
        if c == '\\' {
            escape = true;
            if !is_stripping(&scope_stack) {
                result.push(c);
            }
            declaration_buffer.push(c);
            i += 1;
            continue;
        }

        // Xử lý chuỗi (string/char literal) để tránh đếm nhầm ngoặc {}
        if c == '"' || c == '\'' || c == '`' {
            if !in_string {
                in_string = true;
                string_char = c;
            } else if c == string_char {
                in_string = false;
            }
            if !is_stripping(&scope_stack) {
                result.push(c);
            }
            declaration_buffer.push(c);
            i += 1;
            continue;
        }

        if in_string {
            if !is_stripping(&scope_stack) {
                result.push(c);
            }
            declaration_buffer.push(c);
            i += 1;
            continue;
        }

        // Bắt đầu xử lý ngoặc nhọn
        if c == '{' {
            let is_keep = is_keep_scope(&declaration_buffer);
            let scope_type = if is_keep { ScopeType::Keep } else { ScopeType::Strip };

            if !is_stripping(&scope_stack) {
                result.push('{');
                if scope_type == ScopeType::Strip {
                    result.push_str(" ... ");
                }
            }

            scope_stack.push(scope_type);
            declaration_buffer.clear();
        } else if c == '}' {
            let popped = scope_stack.pop();

            if popped == Some(ScopeType::Strip) {
                // Nếu vừa thoát khỏi block cần xóa, và cha của nó không bị xóa, thì in dấu } đóng
                if !is_stripping(&scope_stack) {
                    result.push('}');
                }
            } else if popped == Some(ScopeType::Keep) {
                // Thoát khỏi class/struct
                if !is_stripping(&scope_stack) {
                    result.push('}');
                }
            }
            declaration_buffer.clear();
        } else if c == ';' {
            if !is_stripping(&scope_stack) {
                result.push(c);
            }
            // Kết thúc 1 câu lệnh, reset buffer đọc
            declaration_buffer.clear();
        } else {
            if !is_stripping(&scope_stack) {
                result.push(c);
            }
            declaration_buffer.push(c);
        }

        i += 1;
    }

    result
}

// Kiểm tra xem có đang ở trong bất kỳ block nào cần Strip hay không
// Bằng cách này, mọi structs khai báo nội bộ trong hàm, hay lệnh if lồng nhau đều bị chặn xuất ra.
fn is_stripping(stack: &[ScopeType]) -> bool {
    stack.contains(&ScopeType::Strip)
}

// Nhận diện xem block sắp mở ra là Class/Struct (giữ) hay Hàm (xóa)
fn is_keep_scope(buffer: &str) -> bool {
    let text = buffer.replace('\n', " ").replace('\r', " ");
    let words: Vec<&str> = text
        .split(|c: char| !c.is_alphanumeric() && c != '_')
        .filter(|s| !s.is_empty())
        .collect();

    for w in words {
        if matches!(
            w,
            "class" | "struct" | "namespace" | "enum" | "union" | "interface" | "trait" | "impl" | "extern" | "record"
        ) {
            return true;
        }
    }
    false
}