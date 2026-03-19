use lazy_static::lazy_static;
use regex::Regex;

lazy_static! {
    static ref EMPTY_LINES_REGEX: Regex = Regex::new(r"\n\s*\n\s*\n+").unwrap();
}

pub fn parse(content: &str) -> String {
    let mut result = String::with_capacity(content.len());
    let mut lines = content.lines().peekable();

    let mut in_triple_quote: Option<&str> = None;
    let mut paren_depth: isize = 0;

    // (indent_level, is_init)
    let mut function_stack: Vec<(usize, bool)> = Vec::new();

    let mut in_signature = false;
    let mut signature_indent = 0;
    let mut is_init_signature = false;
    let mut keeping_assignment = false;

    while let Some(line) = lines.next() {
        let started_in_string = in_triple_quote.is_some();
        let started_in_paren = paren_depth > 0;

        let mut in_single_quote = false;
        let mut in_double_quote = false;
        let mut escape = false;
        let mut comment_start = None;
        let mut logical_end_colon = false;

        let mut chars_iter = line.chars().peekable();
        let mut idx = 0;

        while let Some(c) = chars_iter.next() {
            if escape {
                escape = false;
                idx += c.len_utf8();
                continue;
            }
            if c == '\\' {
                escape = true;
                idx += c.len_utf8();
                continue;
            }

            if in_triple_quote.is_none() && !in_single_quote && !in_double_quote {
                if c == '#' {
                    comment_start = Some(idx);
                    break;
                }
                if c == '\'' {
                    let mut peek_clone = chars_iter.clone();
                    if peek_clone.next() == Some('\'') && peek_clone.next() == Some('\'') {
                        in_triple_quote = Some("'''");
                        chars_iter.next(); chars_iter.next();
                        idx += 3;
                        continue;
                    } else {
                        in_single_quote = true;
                    }
                } else if c == '"' {
                    let mut peek_clone = chars_iter.clone();
                    if peek_clone.next() == Some('"') && peek_clone.next() == Some('"') {
                        in_triple_quote = Some("\"\"\"");
                        chars_iter.next(); chars_iter.next();
                        idx += 3;
                        continue;
                    } else {
                        in_double_quote = true;
                    }
                } else if c == '(' || c == '[' || c == '{' {
                    paren_depth += 1;
                } else if c == ')' || c == ']' || c == '}' {
                    paren_depth -= 1;
                } else if c == ':' && paren_depth <= 0 {
                    let mut peek_spaces = chars_iter.clone();
                    let mut is_end = true;
                    while let Some(pc) = peek_spaces.next() {
                        if pc == '#' { break; }
                        if !pc.is_whitespace() {
                            is_end = false;
                            break;
                        }
                    }
                    if is_end {
                        logical_end_colon = true;
                    }
                }
            } else if let Some(tq) = in_triple_quote {
                let quote_char = tq.chars().next().unwrap();
                if c == quote_char {
                    let mut peek_clone = chars_iter.clone();
                    if peek_clone.next() == Some(quote_char) && peek_clone.next() == Some(quote_char) {
                        in_triple_quote = None;
                        chars_iter.next(); chars_iter.next();
                        idx += 3;
                        continue;
                    }
                }
            } else if in_single_quote && c == '\'' {
                in_single_quote = false;
            } else if in_double_quote && c == '"' {
                in_double_quote = false;
            }

            idx += c.len_utf8();
        }

        let is_blank_or_comment = line.trim().is_empty() || comment_start == Some(0) || line.trim_start().starts_with('#');
        let indent = line.len() - line.trim_start().len();

        if !started_in_string && !started_in_paren && !is_blank_or_comment {
            while let Some(&(func_indent, _)) = function_stack.last() {
                if indent <= func_indent {
                    function_stack.pop();
                    keeping_assignment = false;
                } else {
                    break;
                }
            }
        }

        let in_any_function = !function_stack.is_empty();
        let current_func_is_init = function_stack.last().map(|&(_, is_init)| is_init).unwrap_or(false);

        if in_signature {
            result.push_str(line);
            result.push('\n');
            if logical_end_colon && paren_depth <= 0 && in_triple_quote.is_none() {
                in_signature = false;
                function_stack.push((signature_indent, is_init_signature));
                result.push_str(&" ".repeat(signature_indent + 4));
                result.push_str("pass\n");
            }
            continue;
        }

        if !started_in_string && !started_in_paren && !is_blank_or_comment {
            let trimmed = line.trim_start();
            if trimmed.starts_with("def ") || trimmed.starts_with("async def ") {
                result.push_str(line);
                result.push('\n');

                let is_init = trimmed.contains("def __init__");

                if logical_end_colon && paren_depth <= 0 {
                    function_stack.push((indent, is_init));
                    result.push_str(&" ".repeat(indent + 4));
                    result.push_str("pass\n");
                } else {
                    in_signature = true;
                    signature_indent = indent;
                    is_init_signature = is_init;
                }
                continue;
            }
        }

        if in_any_function {
            if current_func_is_init {
                let trimmed = line.trim_start();
                if !keeping_assignment && trimmed.starts_with("self.") && trimmed.contains('=') {
                    let before_eq = trimmed.split('=').next().unwrap_or("").trim();
                    if !before_eq.contains('(') {
                        keeping_assignment = true;
                    }
                }

                if keeping_assignment {
                    result.push_str(line);
                    result.push('\n');
                    if paren_depth <= 0 && in_triple_quote.is_none() {
                        keeping_assignment = false;
                    }
                }
            }
        } else {
            result.push_str(line);
            result.push('\n');
        }
    }

    EMPTY_LINES_REGEX.replace_all(&result, "\n\n").trim().to_string()
}