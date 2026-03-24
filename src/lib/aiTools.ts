// src/lib/aiTools.ts

// Định nghĩa một cấu trúc chung, không phụ thuộc vào nhà cung cấp
interface ToolParameter {
  type: "string" | "number" | "array" | "object" | "boolean";
  description: string;
  items?: Record<string, any>; // Hỗ trợ mảng object
  properties?: Record<string, any>;
  required?: string[];
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
    description: "Lấy cấu trúc file và thư mục hoàn chỉnh của dự án hiện tại. KHUYẾN KHÍCH gọi tool này cùng với các tool khác trong 1 lượt (Multi-tool calling).",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  READ_FILE: {
    name: "read_file",
    description:
      "Đọc nội dung của MỘT hoặc NHIỀU file cụ thể trong dự án. KHUYẾN KHÍCH gọi tool này cùng lúc với các tool khác, hoặc truyền nhiều file vào mảng để đọc cùng lúc nhằm tiết kiệm thời gian.",
    parameters: {
      type: "object",
      properties: {
        files_to_read: {
          type: "array",
          description: "Danh sách các file cần đọc.",
          items: {
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
      },
      required: ["files_to_read"],
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
  GET_DUMMY_PROJECT_CONTEXT: {
    name: "get_dummy_project_context",
    description: "Lấy toàn bộ ngữ cảnh dự án ở chế độ Dummy (chỉ giữ lại cấu trúc file, class, hàm, biến và ẩn đi logic bên trong). Dùng công cụ này để có cái nhìn tổng quan về kiến trúc mã nguồn nhằm tự động tạo nhóm ngữ cảnh. Khuyến khích gọi kết hợp cùng lúc với các tool khác.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  CREATE_CONTEXT_GROUP: {
    name: "create_context_group",
    description: "Tạo một nhóm ngữ cảnh (Context Group) mới với tên chỉ định. Nhóm vừa tạo sẽ tự động được chọn làm nhóm đang chỉnh sửa hiện tại.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Tên của nhóm ngữ cảnh mới (ví dụ: 'Fix Login Bug', 'Refactor Auth').",
        },
      },
      required: ["name"],
    },
  },
  BASH: {
    name: "bash",
    description: "Chạy các lệnh terminal/shell (ví dụ: git, npm, cargo check, python, ls). KHÔNG dùng tool này để đọc, ghi hay tìm kiếm file (sử dụng read, write, glob, grep thay thế). Cần chờ tiến trình kết thúc nên hãy dùng cho các lệnh có tính dừng.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Lệnh terminal cần thực thi." }
      },
      required: ["command"]
    }
  },
  READ: {
    name: "read",
    description: "Đọc nội dung của file từ ổ đĩa. Hỗ trợ phân trang bằng offset và limit để đọc các file lớn mà không bị tràn token.",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Đường dẫn file (tương đối từ gốc dự án)." },
        offset: { type: "number", description: "Dòng bắt đầu đọc (1-indexed). Mặc định là 1." },
        limit: { type: "number", description: "Số lượng dòng tối đa muốn đọc. Mặc định là 2000." }
      },
      required: ["file_path"]
    }
  },
  WRITE: {
    name: "write",
    description: "Tạo mới hoặc ghi đè HOÀN TOÀN nội dung vào một file. Không dùng tool này để sửa một vài dòng (hãy dùng tool 'edit' thay thế).",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Đường dẫn file (tương đối từ gốc dự án)." },
        content: { type: "string", description: "Nội dung hoàn chỉnh của file." }
      },
      required: ["file_path", "content"]
    }
  },
  EDIT: {
    name: "edit",
    description: "Sửa đổi nội dung file bằng cách thay thế chuỗi chính xác (Exact string replacement). Đảm bảo 'old_string' khớp 100% với mã nguồn hiện tại bao gồm cả khoảng trắng và thụt lề (indentation).",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Đường dẫn file (tương đối từ gốc dự án)." },
        old_string: { type: "string", description: "Chuỗi code cũ cần được thay thế (Phải khớp chính xác tuyệt đối)." },
        new_string: { type: "string", description: "Chuỗi code mới sẽ được thay vào." },
        replace_all: { type: "boolean", description: "Thay thế tất cả các lần xuất hiện của old_string. Mặc định: false" }
      },
      required: ["file_path", "old_string", "new_string"]
    }
  },
  GLOB: {
    name: "glob",
    description: "Tìm kiếm đường dẫn file trong dự án bằng mẫu glob pattern (ví dụ: 'src/**/*.ts', '*.md'). Rất nhanh và nhẹ.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Mẫu glob để tìm kiếm." }
      },
      required: ["pattern"]
    }
  },
  GREP: {
    name: "grep",
    description: "Tìm kiếm nội dung (chuỗi hoặc regex) bên trong các file của dự án. Trả về đường dẫn file, số dòng và nội dung dòng chứa từ khóa.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Chuỗi hoặc Regex cần tìm." }
      },
      required: ["pattern"]
    }
  }
};

/**
 * Lấy danh sách các tool có sẵn dựa trên ngữ cảnh hiện tại.
 */
function getAvailableTools(
  aiChatMode: "ask" | "context" | "mc",
  editingGroupId: string | null
): ToolDefinition[] {
  if (aiChatMode === "ask") {
    return [];
  }

  const tools: ToolDefinition[] = [
    ALL_TOOLS.GET_PROJECT_FILE_TREE,
    ALL_TOOLS.READ_FILE,
  ];

  if (aiChatMode === "mc") {
    tools.push(ALL_TOOLS.GET_DUMMY_PROJECT_CONTEXT);
    tools.push(ALL_TOOLS.CREATE_CONTEXT_GROUP);
    tools.push(ALL_TOOLS.MODIFY_CONTEXT_GROUP);
    tools.push(ALL_TOOLS.ADD_EXCLUSION_RANGE_TO_FILE);
    // Opencode Primitives
    tools.push(ALL_TOOLS.BASH);
    tools.push(ALL_TOOLS.READ);
    tools.push(ALL_TOOLS.WRITE);
    tools.push(ALL_TOOLS.EDIT);
    tools.push(ALL_TOOLS.GLOB);
    tools.push(ALL_TOOLS.GREP);
    if (editingGroupId) {
      tools.push(ALL_TOOLS.GET_CURRENT_CONTEXT_GROUP_FILES);
    }
  } else if (aiChatMode === "context") {
    tools.push(ALL_TOOLS.CREATE_CONTEXT_GROUP);
    tools.push(ALL_TOOLS.MODIFY_CONTEXT_GROUP);
    tools.push(ALL_TOOLS.ADD_EXCLUSION_RANGE_TO_FILE);
    if (editingGroupId) {
      tools.push(ALL_TOOLS.GET_CURRENT_CONTEXT_GROUP_FILES);
    }
  }

  return tools;
}

/**
 * Định dạng các tool cho API của OpenRouter/OpenAI.
 */
export function getOpenRouterTools(
  aiChatMode: "ask" | "context" | "mc",
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
  aiChatMode: "ask" | "context" | "mc",
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
