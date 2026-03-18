use regex::Regex;
use lazy_static::lazy_static;

lazy_static! {
    static ref CLASSNAME_REGEX: Regex = Regex::new(r#"className="([^"]{30,})""#).unwrap();
    static ref CLASSNAME_TPL_REGEX: Regex = Regex::new(r#"className=\{`([^`]{30,})`\}"#).unwrap();
    static ref CLASS_REGEX: Regex = Regex::new(r#"class="([^"]{30,})""#).unwrap();
    static ref SVG_REGEX: Regex = Regex::new(r#"(?s)<svg[^>]*>.*?</svg>"#).unwrap();
    static ref EMPTY_LINES_REGEX: Regex = Regex::new(r"\n\s*\n\s*\n+").unwrap();
}

pub fn parse(content: &str, extension: &str) -> String {
    let is_ui = ["tsx", "jsx", "vue", "svelte"].contains(&extension);
    let mut processed_content = content.to_string();

    if is_ui {
        processed_content = CLASSNAME_REGEX.replace_all(&processed_content, "className=\"...\"").to_string();
        processed_content = CLASSNAME_TPL_REGEX.replace_all(&processed_content, "className={`...`}").to_string();
        processed_content = CLASS_REGEX.replace_all(&processed_content, "class=\"...\"").to_string();
        processed_content = SVG_REGEX.replace_all(&processed_content, "<svg>...</svg>").to_string();
    }

    let mut result = String::with_capacity(processed_content.len());
    let mut brace_depth = 0;
    let mut paren_depth = 0;
    let mut in_string = false;
    let mut string_char = ' ';
    let mut escape = false;

    let mut collapsed_stack = vec![false];
    let mut current_block_collapsed = false;
    let mut recent_chars = String::new();

    let chars: Vec<char> = processed_content.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        let c = chars[i];

        if escape {
            if !current_block_collapsed {
                result.push(c);
                recent_chars.push(c);
            }
            escape = false;
            i += 1;
            continue;
        }

        if c == '\\' {
            escape = true;
            if !current_block_collapsed {
                result.push(c);
                recent_chars.push(c);
            }
            i += 1;
            continue;
        }

        if (c == '"' || c == '\'' || c == '`') && !in_string {
            in_string = true;
            string_char = c;
            if !current_block_collapsed {
                result.push(c);
                recent_chars.push(c);
            }
            i += 1;
            continue;
        } else if c == string_char && in_string {
            in_string = false;
            if !current_block_collapsed {
                result.push(c);
                recent_chars.push(c);
            }
            i += 1;
            continue;
        }

        if !in_string && c == '/' {
            let prev_char = recent_chars.trim_end().chars().last().unwrap_or(' ');
            if "(=!?:;,(&|{[".contains(prev_char) {
                let mut is_regex = false;
                let mut j = i + 1;
                let mut rx_escape = false;
                while j < len {
                    if rx_escape {
                        rx_escape = false;
                        j += 1;
                        continue;
                    }
                    if chars[j] == '\\' {
                        rx_escape = true;
                    } else if chars[j] == '\n' {
                        break;
                    } else if chars[j] == '/' {
                        is_regex = true;
                        break;
                    }
                    j += 1;
                }
                if is_regex {
                    if !current_block_collapsed {
                        let rx_str: String = chars[i..=j].iter().collect();
                        result.push_str(&rx_str);
                        recent_chars.push_str(&rx_str);
                    }
                    i = j + 1;
                    continue;
                }
            }
        }

        if !in_string {
            if c == '(' {
                paren_depth += 1;
            } else if c == ')' {
                if paren_depth > 0 { paren_depth -= 1; }
            }

            if c == '{' {
                let normalized_recent = recent_chars.replace('\n', " ");
                let pre_text = normalized_recent.trim_end();

                let should_collapse = if paren_depth > 0 {
                    false
                } else if pre_text.ends_with("import") || pre_text.contains("import ") {
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
                    || pre_text.contains("declare ")
                {
                    false
                } else if pre_text.ends_with(":")
                    || pre_text.ends_with("<")
                    || pre_text.ends_with("|")
                    || pre_text.ends_with("&")
                    || pre_text.ends_with("const")
                    || pre_text.ends_with("let")
                    || pre_text.ends_with("var")
                    || pre_text.ends_with("=")
                    || pre_text.ends_with("(")
                    || pre_text.ends_with("return")
                {
                    false
                } else {
                    true
                };

                let will_collapse = current_block_collapsed || should_collapse;
                collapsed_stack.push(will_collapse);
                current_block_collapsed = will_collapse;
                brace_depth += 1;

                let parent_collapsed = if collapsed_stack.len() >= 2 {
                    collapsed_stack[collapsed_stack.len() - 2]
                } else {
                    false
                };

                if !parent_collapsed {
                    result.push(c);
                    if current_block_collapsed {
                        result.push_str(" ... ");
                    }
                }

                recent_chars.clear();
                i += 1;
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

                if !parent_collapsed {
                    result.push(c);
                }

                recent_chars.clear();
                i += 1;
                continue;
            } else if c == ';' {
                if !current_block_collapsed {
                    result.push(c);
                }
                recent_chars.clear();
                i += 1;
                continue;
            }
        }

        if !current_block_collapsed {
            result.push(c);
            recent_chars.push(c);
            if recent_chars.len() > 2000 {
                let drained: String = recent_chars.chars().skip(1000).collect();
                recent_chars = drained;
            }
        }
        i += 1;
    }

    EMPTY_LINES_REGEX.replace_all(&result, "\n\n").to_string()
}