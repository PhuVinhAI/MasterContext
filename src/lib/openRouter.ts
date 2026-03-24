// src/lib/openRouter.ts
import { invoke } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { type AppState, useAppStore } from "@/store/appStore";
import { type ChatMessage, type GenerationInfo, type ToolCall } from "@/store/types";

type StoreApi = {
  getState: () => AppState;
  setState: (
    partial:
      | AppState
      | Partial<AppState>
      | ((state: AppState) => AppState | Partial<AppState>),
    replace?: false | undefined
  ) => void;
};

/**
 * Handles a tool call from the AI, executes the tool, and triggers a new response fetch.
 */
export const handleToolCalls = async (
  toolCalls: ChatMessage["tool_calls"],
  storeApi: StoreApi,
  generationInfo?: GenerationInfo
) => {
  if (!toolCalls) return;
  const { getState, setState } = storeApi;

  // 1. Add assistant's tool call message to history (hidden)
  const assistantMessage: ChatMessage = {
    role: "assistant",
    content: null,
    tool_calls: toolCalls,
    hidden: false,
    ...(generationInfo && { generationInfo }),
  };
  setState((state: AppState) => ({
    chatMessages: [...state.chatMessages, assistantMessage],
  }));

  // Cập nhật session ngay lập tức để UI hiển thị số token đã dùng cho lượt gọi này
  await getState().actions.saveCurrentChatSession();

  // 2. Execute tools
  setState({ isAiPanelLoading: true }); // Keep loading state for the next AI call

  const combinedToolResults: string[] = [];

  let requiresRescan = false;

  for (let i = 0; i < toolCalls.length; i++) {
    const tool = toolCalls[i];
    let toolResultContent = `Error: Tool '${tool.function.name}' not found or failed to execute.`;
    let toolSucceeded = false;

    if (tool.function.name === "get_project_file_tree") {
      const fileTree = getState().fileTree;
      if (fileTree && fileTree.children) {
        const children = fileTree.children;
        toolResultContent =
          "Current project structure:\n" +
          children
            .map((child, index) =>
              formatNode(child, "", index === children.length - 1)
            )
            .join("");
      }
      toolSucceeded = true;
    } else if (tool.function.name === "read_file") {
      const { rootPath } = getState();
      if (!rootPath) {
        toolResultContent = "Error: Project path is not available to read file.";
      } else {
        try {
          const args = JSON.parse(tool.function.arguments);
          // Hỗ trợ cả định dạng cũ (file_path) và mới (files_to_read)
          const filesToRead = args.files_to_read || (args.file_path ? [args] : []);

          if (filesToRead.length === 0) {
            toolResultContent = "Error: No files specified to read.";
            toolSucceeded = false;
          } else {
            let combinedResults = "";
            let successCount = 0;

            for (const fileReq of filesToRead) {
              try {
                const content = await invoke<string>("read_file_with_lines", {
                  rootPathStr: rootPath,
                  fileRelPath: fileReq.file_path,
                  startLine: fileReq.start_line,
                  endLine: fileReq.end_line,
                });
                combinedResults += `--- START OF FILE ${fileReq.file_path} ${fileReq.start_line ? `(Lines ${fileReq.start_line}-${fileReq.end_line})` : ''} ---\n${content}\n--- END OF FILE ${fileReq.file_path} ---\n\n`;
                successCount++;
              } catch (err) {
                combinedResults += `--- ERROR READING FILE ${fileReq.file_path} ---\n${err}\n\n`;
              }
            }
            toolResultContent = combinedResults.trim();
            toolSucceeded = successCount > 0;
          }
        } catch (e) {
          toolResultContent = `Error parsing arguments or reading files: ${e}`;
          toolSucceeded = false;
        }
      }
    } else if (tool.function.name === "get_current_context_group_files") {
      const { editingGroupId, rootPath, activeProfile } = getState();
      if (!editingGroupId || !rootPath || !activeProfile) {
        toolResultContent =
          "Error: No group is currently being edited. The user must select a group to check its files.";
      } else {
        try {
          const files = await invoke<string[]>("get_expanded_files_for_group", {
            path: rootPath,
            profileName: activeProfile,
            groupId: editingGroupId,
          });
          toolResultContent = `The current group contains the following files:\n${files.join(
            "\n"
          )}`;
          toolSucceeded = true;
        } catch (e) {
          toolResultContent = `Error getting group files: ${e}`;
          toolSucceeded = false;
        }
      }
    } else if (tool.function.name === "modify_context_group") {
      const { editingGroupId, rootPath, activeProfile } = getState();
      if (!editingGroupId || !rootPath || !activeProfile) {
        toolResultContent =
          "Error: No group is currently being edited. The user must select a group to modify first.";
      } else {
        try {
          const args = JSON.parse(tool.function.arguments);
          const pathsToAdd = args.files_to_add || [];
          const pathsToRemove = args.files_to_remove || [];

          const result = await invoke<
            import("@/store/types").AIGroupUpdateResult
          >("update_group_paths_from_ai", {
            path: rootPath,
            profileName: activeProfile,
            groupId: editingGroupId,
            pathsToAdd,
            pathsToRemove,
          });

          // Update the group state in Zustand, including tempSelectedPaths
          await getState().actions._updateGroupFromAi(result.updatedGroup);

          let resultMessage = "Successfully modified the group.";
          if (pathsToAdd.length > 0)
            resultMessage += ` Added: ${pathsToAdd.join(", ")}.`;
          if (pathsToRemove.length > 0)
            resultMessage += ` Removed: ${pathsToRemove.join(", ")}.`;
          resultMessage += `\n\nThe group now contains the following files:\n${result.finalExpandedFiles.join(
            "\n"
          )}`;
          toolResultContent = resultMessage;
          toolSucceeded = true;
        } catch (e) {
          toolResultContent = `Error modifying group: ${e}`;
          toolSucceeded = false;
        }
      }
    } else if (tool.function.name === "add_exclusion_range_to_file") {
      const { actions } = getState();
      try {
        const args = JSON.parse(tool.function.arguments);
        const result = await actions.addExclusionRangeFromAI(
          args.file_path,
          args.start_line,
          args.end_line
        );
        toolResultContent = result.message;
        toolSucceeded = result.success;
      } catch (e) {
        toolResultContent = `Error adding exclusion range: ${e}`;
        toolSucceeded = false;
      }
    } else if (tool.function.name === "get_dummy_project_context") {
      const { rootPath, activeProfile } = getState();
      if (!rootPath || !activeProfile) {
        toolResultContent = "Error: Project path or profile is not available.";
      } else {
        try {
          const context = await invoke<string>("generate_dummy_project_context_for_ai", {
            path: rootPath,
            profileName: activeProfile,
          });
          toolResultContent = `DUMMY PROJECT CONTEXT:\n\n${context}`;
          toolSucceeded = true;
        } catch (e) {
          toolResultContent = `Error generating dummy context: ${e}`;
          toolSucceeded = false;
        }
      }
    } else if (tool.function.name === "create_context_group") {
      try {
        const args = JSON.parse(tool.function.arguments);
        const name = args.name || "AI Generated Group";
        getState().actions.addGroup({ name });
        toolResultContent = `Successfully created and selected new context group: "${name}". You can now use modify_context_group to add files to it.`;
        toolSucceeded = true;
      } catch (e) {
        toolResultContent = `Error creating group: ${e}`;
        toolSucceeded = false;
      }
    } else if (tool.function.name === "manage_filesystem") {
      const { rootPath, gitRepoInfo } = getState();
      if (!gitRepoInfo?.isRepository) {
        toolResultContent = "Error: Project must be a Git repository to use file modification tools. This is a strict safety policy. Please initialize Git first.";
      } else if (!rootPath) {
        toolResultContent = "Error: Project path not found.";
      } else {
        try {
          const args = JSON.parse(tool.function.arguments);
          const ops = args.operations || [];
          let combinedResults = "";
          let successCount = 0;

          for (const op of ops) {
            try {
              if (op.action === "create_file") {
                await invoke("create_file", { rootPathStr: rootPath, fileRelPath: op.path, content: op.content || "" });
                combinedResults += `[SUCCESS] Created file: ${op.path}\n`;
              } else if (op.action === "delete") {
                await invoke("delete_file", { rootPathStr: rootPath, fileRelPath: op.path });
                combinedResults += `[SUCCESS] Deleted: ${op.path}\n`;
              } else if (op.action === "create_dir") {
                await invoke("create_directory", { rootPathStr: rootPath, dirRelPath: op.path });
                combinedResults += `[SUCCESS] Created directory: ${op.path}\n`;
              } else {
                combinedResults += `[ERROR] Unknown action: ${op.action}\n`;
              }
              successCount++;
            } catch (err) {
              combinedResults += `[ERROR] Action ${op.action} on ${op.path} failed: ${err}\n`;
            }
          }
          toolResultContent = combinedResults.trim() || "No operations executed.";
          toolSucceeded = successCount > 0;
        } catch (e) {
          toolResultContent = `Error parsing operations: ${e}`;
        }
      }
    } else if (tool.function.name === "edit_file_by_lines") {
      const { rootPath, gitRepoInfo } = getState();
      if (!gitRepoInfo?.isRepository) {
        toolResultContent = "Error: Project must be a Git repository to use file modification tools. This is a strict safety policy. Please initialize Git first.";
      } else if (!rootPath) {
        toolResultContent = "Error: Project path not found.";
      } else {
        try {
          const args = JSON.parse(tool.function.arguments);
          const edits = args.edits || [];
          let combinedResults = "";
          let successCount = 0;

          for (const edit of edits) {
            try {
              await invoke("replace_file_lines", {
                rootPathStr: rootPath,
                fileRelPath: edit.file_path,
                startLine: edit.start_line,
                endLine: edit.end_line,
                newContent: edit.new_content
              });
              combinedResults += `[SUCCESS] Updated lines ${edit.start_line}-${edit.end_line} in ${edit.file_path}\n`;
              successCount++;
            } catch (err) {
              combinedResults += `[ERROR] Failed to edit lines in ${edit.file_path}: ${err}\n`;
            }
          }
          toolResultContent = combinedResults.trim() || "No edits executed.";
          toolSucceeded = successCount > 0;
        } catch (e) {
          toolResultContent = `Error parsing edits: ${e}`;
        }
      }
    } else if (tool.function.name === "apply_diff_blocks") {
      const { rootPath, gitRepoInfo } = getState();
      if (!gitRepoInfo?.isRepository) {
        toolResultContent = "Error: Project must be a Git repository to use file modification tools. This is a strict safety policy. Please initialize Git first.";
      } else if (!rootPath) {
        toolResultContent = "Error: Project path not found.";
      } else {
        try {
          const args = JSON.parse(tool.function.arguments);
          const edits = args.edits || [];
          let combinedResults = "";
          let successCount = 0;

          for (const edit of edits) {
            try {
              const blocks = edit.blocks.map((b: any) => ({
                search: b.search_block,
                replace: b.replace_block
              }));
              await invoke("apply_multiple_search_replace", {
                rootPathStr: rootPath,
                fileRelPath: edit.file_path,
                blocks
              });
              combinedResults += `[SUCCESS] Applied ${blocks.length} diff block(s) to ${edit.file_path}\n`;
              successCount++;
            } catch (err) {
              combinedResults += `[ERROR] Failed to apply diff to ${edit.file_path}: ${err}\n`;
            }
          }
          toolResultContent = combinedResults.trim() || "No diffs executed.";
          toolSucceeded = successCount > 0;
        } catch (e) {
          toolResultContent = `Error parsing diff blocks: ${e}`;
        }
      }
    } else if (tool.function.name === "git_status") {
      const { rootPath } = getState();
      if (!rootPath) {
        toolResultContent = "Error: Project path not found.";
      } else {
        try {
          const status = await invoke("get_git_status", { path: rootPath });
          toolResultContent = JSON.stringify(status, null, 2);
          toolSucceeded = true;
        } catch (e) {
          toolResultContent = `Error fetching git status: ${e}`;
        }
      }
    } else if (tool.function.name === "git_commit_all") {
      const { rootPath } = getState();
      if (!rootPath) {
        toolResultContent = "Error: Project path not found.";
      } else {
        try {
          const args = JSON.parse(tool.function.arguments);
          const result = await invoke<string>("git_commit_all", { path: rootPath, message: args.message });
          toolResultContent = `[SUCCESS] Git Commit All executed:\n${result}`;
          toolSucceeded = true;
          getState().actions.checkGitRepo();
        } catch (e) {
          toolResultContent = `Error during git commit: ${e}`;
        }
      }
    } else if (tool.function.name === "git_push") {
      const { rootPath } = getState();
      if (!rootPath) {
        toolResultContent = "Error: Project path not found.";
      } else {
        try {
          const result = await invoke<string>("git_push", { path: rootPath });
          toolResultContent = `[SUCCESS] Git Push executed:\n${result}`;
          toolSucceeded = true;
          getState().actions.checkGitRepo();
        } catch (e) {
          toolResultContent = `Error during git push: ${e}`;
        }
      }
    } else if (tool.function.name === "git_create_branch") {
      const { rootPath } = getState();
      if (!rootPath) {
        toolResultContent = "Error: Project path not found.";
      } else {
        try {
          const args = JSON.parse(tool.function.arguments);
          const result = await invoke<string>("git_create_branch", { path: rootPath, branchName: args.branch_name });
          toolResultContent = `[SUCCESS] Git Create Branch executed:\n${result}`;
          toolSucceeded = true;
          getState().actions.checkGitRepo();
        } catch (e) {
          toolResultContent = `Error during git branch creation: ${e}`;
        }
      }
    } else if (tool.function.name === "git_switch_branch") {
      const { rootPath } = getState();
      if (!rootPath) {
        toolResultContent = "Error: Project path not found.";
      } else {
        try {
          const args = JSON.parse(tool.function.arguments);
          await invoke("checkout_branch", { path: rootPath, branch: args.branch_name });
          toolResultContent = `[SUCCESS] Switched to branch: ${args.branch_name}`;
          toolSucceeded = true;
          getState().actions.checkGitRepo();
          requiresRescan = true;
        } catch (e) {
          toolResultContent = `Error switching branch: ${e}`;
        }
      }
    }

    if (toolSucceeded && ["manage_filesystem", "edit_file_by_lines", "apply_diff_blocks"].includes(tool.function.name)) {
      requiresRescan = true;
    }

    toolCalls[i].status = toolSucceeded ? "success" : "error";
    toolCalls[i].result = toolResultContent;

    combinedToolResults.push(`[TOOL_RESULT for ${tool.function.name}]\n${toolResultContent}`);
  }

  // 3. Update the assistant message in state with the tool's execution status
  setState((state) => {
    const newMessages = [...state.chatMessages];
    const lastMessage = newMessages[newMessages.length - 1];
    if (lastMessage?.role === "assistant" && lastMessage.tool_calls) {
      lastMessage.tool_calls = toolCalls; // Update the UI with execution results
    }
    return { chatMessages: newMessages };
  });

  // 4. Add tool result as a hidden user message and re-fetch AI response
  const toolResultMessage: ChatMessage = {
    role: "user",
    content: combinedToolResults.join("\n\n---\n\n"),
    hidden: true,
  };
  setState((state: AppState) => ({
    chatMessages: [...state.chatMessages, toolResultMessage],
  }));
  await getState().actions.saveCurrentChatSession();
  await getState().actions.fetchAiResponse();

  if (requiresRescan && !getState().isScanning) {
    getState().actions.rescanProject();
  }
};

/**
 * Fetches generation info from OpenRouter with a retry mechanism.
 */
export const fetchGenerationInfoWithRetry = async (
  generationId: string,
  apiKey: string,
  retries = 3,
  delay = 500
): Promise<GenerationInfo | null> => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await tauriFetch(
        `https://openrouter.ai/api/v1/generation?id=${generationId}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`Attempt ${i + 1} failed (404). Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.data as GenerationInfo;
    } catch (error) {
      console.error(
        "Failed to fetch generation info with non-retriable error:",
        error
      );
      return null;
    }
  }
  console.warn(
    `All ${retries} attempts to fetch generation info failed for id: ${generationId}`
  );
  return null;
};

/**
 * Handles a non-streaming response from OpenRouter.
 */
export const handleNonStreamingResponse = async (
  response: Response,
  apiKey: string,
  isOpenRouter: boolean = true
): Promise<ChatMessage> => {
  const data = await response.json();
  const assistantMessage = data.choices[0].message;
  const generationId = data.id;

  // Catch reasoning content for non-streaming response
  if (assistantMessage.reasoning_content) {
    assistantMessage.thoughts = assistantMessage.reasoning_content;
  }

  // Extract standard OpenAI/NVIDIA usage if available
  if (data.usage) {
    assistantMessage.generationInfo = {
      tokens_prompt: data.usage.prompt_tokens || 0,
      tokens_completion: data.usage.completion_tokens || 0,
      total_cost: 0,
    };
  }

  if (generationId && isOpenRouter && !assistantMessage.generationInfo) {
    const fetchedInfo = await fetchGenerationInfoWithRetry(
      generationId,
      apiKey
    );
    if (fetchedInfo) {
      assistantMessage.generationInfo = fetchedInfo;
    }
  }

  // Check for tool calls
  if (assistantMessage.tool_calls) {
    await handleToolCalls(
      assistantMessage.tool_calls,
      {
        getState: useAppStore.getState,
        setState: useAppStore.setState,
      },
      assistantMessage.generationInfo
    );
    return assistantMessage; // Return immediately, the recursive call will handle the final message
  }

  return assistantMessage;
};

/**
 * Handles a streaming response from OpenRouter, updating state incrementally.
 */
export const handleStreamingResponse = async (
  response: Response,
  storeApi: StoreApi
): Promise<void> => {
  if (!response.body) {
    throw new Error("Response body is null");
  }

  const { getState, setState } = storeApi;
  const { openRouterApiKey, selectedAiModel, allAvailableModels } = getState();
  const apiKey = openRouterApiKey;
  const isOpenRouter = allAvailableModels.find((m) => m.id === selectedAiModel)?.provider === "openrouter";
  let generationId: string | null = null;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let isFirstChunk = true;
  let finalUsage: GenerationInfo | null = null;
  let toolCallsToExecute: ToolCall[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.trim() === "" || !line.startsWith("data:")) continue;
      if (line.includes("data: [DONE]")) break;

      try {
        const json = JSON.parse(line.substring(5));

        if (json.usage) {
          finalUsage = {
            tokens_prompt: json.usage.prompt_tokens || 0,
            tokens_completion: json.usage.completion_tokens || 0,
            total_cost: 0,
          };
          // Cập nhật State token ngay lập tức nếu API gửi kèm
          setState((state) => {
            const newMessages = [...state.chatMessages];
            const lastIndex = newMessages.length - 1;
            if (newMessages[lastIndex] && newMessages[lastIndex].role === "assistant") {
              newMessages[lastIndex] = { ...newMessages[lastIndex], generationInfo: finalUsage! };
            }
            return { chatMessages: newMessages };
          });
        }

        if (json.id && !generationId) {
          generationId = json.id;
        }

        const toolCallsChunk = json.choices?.[0]?.delta?.tool_calls;
        if (toolCallsChunk && toolCallsChunk.length > 0) {
          for (const tc of toolCallsChunk) {
            const index = tc.index;
            if (!toolCallsToExecute[index]) {
              toolCallsToExecute[index] = {
                id: tc.id || `call_${Date.now()}`,
                type: tc.type || "function",
                function: { name: tc.function?.name || "", arguments: tc.function?.arguments || "" }
              };
            } else {
              if (tc.function?.arguments) {
                toolCallsToExecute[index].function.arguments += tc.function.arguments;
              }
            }
          }
        }

        const delta = json.choices?.[0]?.delta?.content || "";
        const reasoning = json.choices?.[0]?.delta?.reasoning_content || "";

        if (delta || reasoning) {
          if (isFirstChunk) {
            isFirstChunk = false;
            const newAssistantMessage: ChatMessage = {
              role: "assistant",
              content: delta,
              thoughts: reasoning || undefined,
            };
            setState((state) => ({
              chatMessages: [...state.chatMessages, newAssistantMessage],
            }));
          } else {
            setState((state) => {
              const lastMessage =
                state.chatMessages[state.chatMessages.length - 1];
              if (lastMessage && lastMessage.role === "assistant") {
                const updatedMessage = {
                  ...lastMessage,
                  content: (lastMessage.content || "") + delta,
                };
                if (reasoning) {
                  updatedMessage.thoughts = (lastMessage.thoughts || "") + reasoning;
                }
                return {
                  chatMessages: [
                    ...state.chatMessages.slice(0, -1),
                    updatedMessage,
                  ],
                };
              }
              return state;
            });
          }
        }
      } catch (e) {
        console.error("Error parsing stream chunk:", e, "Line:", line);
      }
    }
  }

  // After stream is complete, check generation info from OpenRouter API if no usage was provided in stream
  if (generationId && apiKey && isOpenRouter && !finalUsage) {
    const fetchedInfo = await fetchGenerationInfoWithRetry(
      generationId,
      apiKey
    );
    if (fetchedInfo) {
      finalUsage = fetchedInfo;
    }
  }

  const validToolCalls = toolCallsToExecute.filter(Boolean);

  if (validToolCalls.length > 0) {
    await handleToolCalls(validToolCalls, storeApi, finalUsage || undefined);
    return;
  }

  if (finalUsage) {
    const state = getState();
    const newMessages = [...state.chatMessages];
    const lastIndex = newMessages.length - 1;
    if (newMessages[lastIndex] && newMessages[lastIndex].role === "assistant") {
      newMessages[lastIndex] = { ...newMessages[lastIndex], generationInfo: finalUsage };
      setState({ chatMessages: newMessages });
      await getState().actions.saveCurrentChatSession(newMessages);
    }
  }
};

const formatNode = (
  node: import("@/store/types").FileNode,
  prefix: string,
  isLast: boolean
): string => {
  let res = prefix;
  if (prefix.length > 0 || node.children) {
    res += isLast ? "└── " : "├── ";
  } else {
    res += "    "; // for top-level files
  }
  res += `${node.name}\n`;
  if (node.children) {
    const childPrefix = prefix + (isLast ? "    " : "│   ");
    node.children.forEach((child, index) => {
      res += formatNode(
        child,
        childPrefix,
        index === node.children!.length - 1
      );
    });
  }
  return res;
};
