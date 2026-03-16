// src/lib/aiTools.ts

// Định nghĩa một cấu trúc chung, không phụ thuộc vào nhà cung cấp
interface ToolParameter {
  type: "string" | "number" | "array" | "object";
  description: string;
  items?: { type: "string" }; // Dành cho kiểu array
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

// Tất cả các tool có thể có được định nghĩa ở một nơi
const ALL_TOOLS: Record<string, ToolDefinition> = {
  GET_PROJECT_FILE_TREE: {
    name: "get_project_file_tree",
    description: "Lấy cấu trúc file và thư mục hoàn chỉnh của dự án hiện tại.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  READ_FILE: {
    name: "read_file",
    description:
      "Đọc nội dung của một file cụ thể trong dự án. Có thể đọc toàn bộ file hoặc một khoảng dòng cụ thể.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Đường dẫn tương đối đến file từ gốc dự án.",
        },
        start_line: {
          type: "number",
          description: "Tùy chọn. Số dòng bắt đầu (tính từ 1) để đọc.",
        },
        end_line: {
          type: "number",
          description: "Tùy chọn. Số dòng kết thúc (tính từ 1) để đọc.",
        },
      },
      required: ["file_path"],
    },
  },
  GET_CURRENT_CONTEXT_GROUP_FILES: {
    name: "get_current_context_group_files",
    description:
      "Lấy danh sách tất cả các file hiện có trong nhóm ngữ cảnh mà người dùng đang chỉnh sửa.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  MODIFY_CONTEXT_GROUP: {
    name: "modify_context_group",
    description:
      "Thêm hoặc xóa các file và thư mục khỏi nhóm ngữ cảnh đang được chọn. Đây là cách chính để giúp người dùng quản lý các nhóm ngữ cảnh của họ.",
    parameters: {
      type: "object",
      properties: {
        files_to_add: {
          type: "array",
          description:
            "Một mảng các đường dẫn file hoặc thư mục để thêm vào nhóm. Các đường dẫn phải là tương đối so với gốc dự án.",
          items: { type: "string" },
        },
        files_to_remove: {
          type: "array",
          description:
            "Một mảng các đường dẫn file hoặc thư mục để xóa khỏi nhóm.",
          items: { type: "string" },
        },
      },
    },
  },
  ADD_EXCLUSION_RANGE_TO_FILE: {
    name: "add_exclusion_range_to_file",
    description:
      "Loại trừ một khoảng dòng trong một file cụ thể khỏi ngữ cảnh. Hữu ích để loại bỏ code mẫu, code không liên quan hoặc các cấu trúc dữ liệu lớn.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Đường dẫn tương đối đến file từ gốc dự án.",
        },
        start_line: {
          type: "number",
          description: "Số dòng bắt đầu (tính từ 1) để bắt đầu loại trừ.",
        },
        end_line: {
          type: "number",
          description: "Số dòng kết thúc (tính từ 1) để kết thúc loại trừ.",
        },
      },
      required: ["file_path", "start_line", "end_line"],
    },
  },
  WRITE_FILE: {
    name: "write_file",
    description:
      "Ghi hoặc ghi đè nội dung vào một file cụ thể. Có thể thay thế toàn bộ nội dung file hoặc thay thế một khoảng dòng cụ thể. Để thay thế các dòng cụ thể, BẮT BUỘC phải sử dụng tham số 'start_line'. Để chèn dòng mới mà không xóa, đặt 'end_line' bằng 'start_line'. Để xóa các dòng, cung cấp một chuỗi rỗng cho 'content' và chỉ định 'start_line' và 'end_line'.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Đường dẫn tương đối đến file sẽ được ghi nội dung vào.",
        },
        content: {
          type: "string",
          description: "Nội dung mới để ghi vào file.",
        },
        start_line: {
          type: "number",
          description:
            "Tùy chọn. Số dòng (tính từ 1) nơi việc thay thế sẽ bắt đầu. Nếu bỏ qua, toàn bộ file sẽ bị ghi đè.",
        },
        end_line: {
          type: "number",
          description:
            "Tùy chọn. Số dòng (tính từ 1) nơi việc thay thế sẽ kết thúc. Nếu bỏ qua, nội dung được thay thế từ start_line đến hết nội dung mới.",
        },
      },
      required: ["file_path", "content"],
    },
  },
  CREATE_FILE: {
    name: "create_file",
    description:
      "Tạo một file mới tại một đường dẫn được chỉ định với nội dung ban đầu. Nếu thư mục chứa file chưa tồn tại, hệ thống sẽ tự động tạo thư mục đó.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Đường dẫn tương đối nơi file mới sẽ được tạo (VD: src/components/NewButton.tsx).",
        },
        content: {
          type: "string",
          description: "Tùy chọn. Nội dung ban đầu của file mới.",
        },
      },
      required: ["file_path"],
    },
  },
  RENAME_FILE: {
    name: "rename_file",
    description: "Đổi tên hoặc di chuyển một file HOẶC một thư mục sang đường dẫn mới.",
    parameters: {
      type: "object",
      properties: {
        old_path: {
          type: "string",
          description: "Đường dẫn tương đối hiện tại của file/thư mục cần đổi tên.",
        },
        new_path: {
          type: "string",
          description: "Đường dẫn tương đối mới cho file/thư mục.",
        },
      },
      required: ["old_path", "new_path"],
    },
  },
  CREATE_DIRECTORY: {
    name: "create_directory",
    description: "Tạo một thư mục mới trống rỗng (sẽ tự tạo cả các thư mục cha nếu chưa có). Lưu ý: Nếu dùng lệnh create_file thì không cần gọi lệnh này vì hệ thống tự tạo thư mục cha.",
    parameters: {
      type: "object",
      properties: {
        dir_path: {
          type: "string",
          description: "Đường dẫn tương đối của thư mục cần tạo.",
        },
      },
      required: ["dir_path"],
    },
  },
  DELETE_FILE: {
    name: "delete_file",
    description: "Xóa một file HOẶC một thư mục (bao gồm toàn bộ nội dung bên trong) được chỉ định khỏi dự án.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Đường dẫn tương đối của file hoặc thư mục cần xóa.",
        },
      },
      required: ["file_path"],
    },
  },
  APPLY_SEARCH_REPLACE: {
    name: "apply_search_replace",
    description: "Sửa đổi code bằng cách tìm chính xác một đoạn text và thay thế nó. Khuyến khích dùng cách này thay vì write_file để an toàn và tốn ít token.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Đường dẫn file.",
        },
        search_text: {
          type: "string",
          description: "Đoạn code gốc cần tìm. Bắt buộc phải chính xác 100% từng ký tự, khoảng trắng và thụt lề.",
        },
        replace_text: {
          type: "string",
          description: "Đoạn code mới để thay thế.",
        },
      },
      required: ["file_path", "search_text", "replace_text"],
    },
  },
  EXECUTE_TERMINAL_COMMAND: {
    name: "execute_terminal_command",
    description: "Thực thi các lệnh Terminal (npm install, cargo build, git status, chạy test, list file...). Lệnh sẽ chạy ngầm và trả về stdout/stderr cho bạn.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Câu lệnh bash/cmd cần thực thi (vd: npm run lint).",
        },
      },
      required: ["command"],
    },
  },
};

/**
 * Lấy danh sách các tool có sẵn dựa trên ngữ cảnh hiện tại.
 */
function getAvailableTools(
  aiChatMode: "ask" | "context" | "agent",
  editingGroupId: string | null
): ToolDefinition[] {
  if (aiChatMode === "ask") {
    return [];
  }

  const tools: ToolDefinition[] = [
    ALL_TOOLS.GET_PROJECT_FILE_TREE,
    ALL_TOOLS.READ_FILE,
  ];

  if (editingGroupId) {
    tools.push(ALL_TOOLS.GET_CURRENT_CONTEXT_GROUP_FILES);
    if (aiChatMode === "context") {
      tools.push(ALL_TOOLS.MODIFY_CONTEXT_GROUP);
      tools.push(ALL_TOOLS.ADD_EXCLUSION_RANGE_TO_FILE);
    }
  }

  if (aiChatMode === "agent") {
    tools.push(
      ALL_TOOLS.WRITE_FILE,
      ALL_TOOLS.CREATE_FILE,
      ALL_TOOLS.RENAME_FILE,
      ALL_TOOLS.CREATE_DIRECTORY,
      ALL_TOOLS.DELETE_FILE,
      ALL_TOOLS.APPLY_SEARCH_REPLACE,
      ALL_TOOLS.EXECUTE_TERMINAL_COMMAND,
      ALL_TOOLS.MODIFY_CONTEXT_GROUP,
      ALL_TOOLS.ADD_EXCLUSION_RANGE_TO_FILE
    );
  }

  return tools;
}

/**
 * Định dạng các tool cho API của OpenRouter/OpenAI.
 */
export function getOpenRouterTools(
  aiChatMode: "ask" | "context" | "agent",
  editingGroupId: string | null
): any[] | undefined {
  const tools = getAvailableTools(aiChatMode, editingGroupId);
  if (tools.length === 0) {
    return undefined;
  }
  return tools.map((tool) => ({
    type: "function",
    function: tool,
  }));
}

/**
 * Đệ quy chuyển đổi các kiểu tham số thành chữ hoa cho API của Google.
 */
function convertTypesToUppercase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(convertTypesToUppercase);
  }
  if (obj !== null && typeof obj === "object") {
    const newObj: { [key: string]: any } = {};
    for (const key in obj) {
      if (key === "type" && typeof obj[key] === "string") {
        newObj[key] = obj[key].toUpperCase();
      } else {
        newObj[key] = convertTypesToUppercase(obj[key]);
      }
    }
    return newObj;
  }
  return obj;
}

/**
 * Định dạng các tool cho API của Google Gemini.
 */
export function getGoogleTools(
  aiChatMode: "ask" | "context" | "agent",
  editingGroupId: string | null
): { function_declarations: any[] } | undefined {
  const tools = getAvailableTools(aiChatMode, editingGroupId);
  if (tools.length === 0) {
    return undefined;
  }
  return {
    function_declarations: tools.map((tool) => convertTypesToUppercase(tool)),
  };
}
