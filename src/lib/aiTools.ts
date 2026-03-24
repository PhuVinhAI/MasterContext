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
  MANAGE_FILESYSTEM: {
    name: "manage_filesystem",
    description: "Quản lý hệ thống file (Tạo file, xóa file, tạo thư mục). Xử lý nhiều thao tác cùng lúc. Tạo file ở thư mục chưa tồn tại sẽ tự động tạo thư mục con.",
    parameters: {
      type: "object",
      properties: {
        operations: {
          type: "array",
          description: "Danh sách các thao tác file system.",
          items: {
            type: "object",
            properties: {
              action: { type: "string", description: "'create_file' hoặc 'delete' hoặc 'create_dir'" },
              path: { type: "string", description: "Đường dẫn tương đối từ gốc dự án" },
              content: { type: "string", description: "Nội dung file (bắt buộc khi action = 'create_file')" }
            },
            required: ["action", "path"]
          }
        }
      },
      required: ["operations"]
    }
  },
  APPLY_DIFF_BLOCKS: {
    name: "apply_diff_blocks",
    description: "Sửa đổi nội dung file bằng định dạng SEARCH/REPLACE Diff blocks. Đoạn code trong search_block PHẢI khớp chính xác 100% từng khoảng trắng, thụt lề với file gốc.",
    parameters: {
      type: "object",
      properties: {
        edits: {
          type: "array",
          description: "Danh sách các file cần sửa",
          items: {
            type: "object",
            properties: {
              file_path: { type: "string", description: "Đường dẫn file" },
              blocks: {
                type: "array",
                description: "Mảng chứa các khối search/replace",
                items: {
                  type: "object",
                  properties: {
                    search_block: { type: "string", description: "Mã nguồn gốc cần tìm (Khớp 100%)" },
                    replace_block: { type: "string", description: "Mã nguồn mới thay thế" }
                  },
                  required: ["search_block", "replace_block"]
                }
              }
            },
            required: ["file_path", "blocks"]
          }
        }
      },
      required: ["edits"]
    }
  },
  GIT_STATUS: {
    name: "git_status",
    description: "Xem trạng thái các file bị thay đổi và nội dung diff chi tiết. Mặc định sẽ trả về toàn bộ diff để bạn phân tích, trừ khi bạn chỉ cần cấu hình cây thư mục thì đặt include_diff=false.",
    parameters: {
      type: "object",
      properties: {
        include_diff: {
          type: "boolean",
          description: "Mặc định là true. Nếu false, chỉ trả về danh sách các file bị ảnh hưởng.",
        },
      },
    },
  },
  GIT_COMMIT_ALL: {
    name: "git_commit_all",
    description: "Tự động thêm tất cả thay đổi (git add .) và commit với nội dung chỉ định.",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "Nội dung commit message." }
      },
      required: ["message"]
    },
  },
  GIT_PUSH: {
    name: "git_push",
    description: "Đẩy các commit lên remote repository (git push).",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  GIT_CREATE_BRANCH: {
    name: "git_create_branch",
    description: "Tạo một nhánh mới và chuyển sang nhánh đó (git checkout -b <branch_name>).",
    parameters: {
      type: "object",
      properties: {
        branch_name: { type: "string", description: "Tên nhánh muốn tạo." }
      },
      required: ["branch_name"]
    },
  },
  GIT_SWITCH_BRANCH: {
    name: "git_switch_branch",
    description: "Chuyển sang một nhánh đã tồn tại (git checkout <branch_name>).",
    parameters: {
      type: "object",
      properties: {
        branch_name: { type: "string", description: "Tên nhánh muốn chuyển tới." }
      },
      required: ["branch_name"]
    },
  },
  GIT_DELETE_BRANCH: {
    name: "git_delete_branch",
    description: "Xóa một nhánh cục bộ (git branch -D <branch_name>).",
    parameters: {
      type: "object",
      properties: {
        branch_name: { type: "string", description: "Tên nhánh muốn xóa." }
      },
      required: ["branch_name"]
    },
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
    tools.push(ALL_TOOLS.MANAGE_FILESYSTEM);
    tools.push(ALL_TOOLS.APPLY_DIFF_BLOCKS);
    tools.push(ALL_TOOLS.GIT_STATUS);
    tools.push(ALL_TOOLS.GIT_COMMIT_ALL);
    tools.push(ALL_TOOLS.GIT_PUSH);
    tools.push(ALL_TOOLS.GIT_CREATE_BRANCH);
    tools.push(ALL_TOOLS.GIT_SWITCH_BRANCH);
    tools.push(ALL_TOOLS.GIT_DELETE_BRANCH);
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
