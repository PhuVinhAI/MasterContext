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
  GET_DUMMY_PROJECT_CONTEXT: {
    name: "get_dummy_project_context",
    description: "Lấy toàn bộ ngữ cảnh dự án ở chế độ Dummy (chỉ giữ lại cấu trúc file, class, hàm, biến và ẩn đi logic bên trong). Dùng công cụ này để có cái nhìn tổng quan về kiến trúc mã nguồn nhằm tự động tạo nhóm ngữ cảnh.",
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
    if (editingGroupId) {
      tools.push(ALL_TOOLS.GET_CURRENT_CONTEXT_GROUP_FILES);
    }
  } else if (aiChatMode === "context") {
    if (editingGroupId) {
      tools.push(ALL_TOOLS.GET_CURRENT_CONTEXT_GROUP_FILES);
      tools.push(ALL_TOOLS.MODIFY_CONTEXT_GROUP);
      tools.push(ALL_TOOLS.ADD_EXCLUSION_RANGE_TO_FILE);
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
