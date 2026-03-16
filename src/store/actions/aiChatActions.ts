// src/store/actions/aiChatActions.ts
import { StateCreator } from "zustand";
import { AppState } from "../appStore";
import i18n from "@/i18n";

// Đặt ở đầu file để tránh nhầm lẫn — dùng trước khi định nghĩa
// Helper to get translations
const t = (key: string) => i18n.t(key);

import {
  type ChatMessage,
  type AIChatSession,
  type AttachedItem,
} from "../types";
import { invoke } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import {
  handleNonStreamingResponse,
  handleStreamingResponse,
} from "@/lib/openRouter";
import {
  handleNonStreamingResponseGoogle,
  handleStreamingResponseGoogle,
  toGooglePayload,
} from "@/lib/googleAI";
import { getGoogleTools, getOpenRouterTools } from "@/lib/aiTools";

export interface AiChatActions {
  sendChatMessage: (prompt: string) => Promise<void>;
  fetchAiResponse: () => Promise<void>;
  stopAiResponse: () => void;
  regenerateResponse: (fromIndex: number) => Promise<void>;
  _internal_editAndResubmit: (
    prompt: string,
    fromIndex: number
  ) => Promise<void>;
}

/**
 * (Private helper) Generates the hidden context string from attached items.
 */
const _generateHiddenContent = async (
  get: () => AppState,
  items: AttachedItem[]
): Promise<string | undefined> => {
  const { rootPath, activeProfile } = get();
  if (items.length === 0 || !rootPath || !activeProfile) {
    return undefined;
  }

  const contentPromises = items.map(async (item: AttachedItem) => {
    if (item.type === "folder") {
      const treeStructure = await invoke<string>("generate_directory_tree", {
        rootPathStr: rootPath,
        dirRelPath: item.id,
      });
      return `--- START OF DIRECTORY STRUCTURE FOR ${item.name} ---\n${treeStructure}\n--- END OF DIRECTORY STRUCTURE FOR ${item.name} ---`;
    } else if (item.type === "group") {
      const groupContext = await invoke<string>(
        "generate_group_context_for_ai",
        {
          rootPathStr: rootPath,
          profileName: activeProfile,
          groupId: item.id,
        }
      );
      return `--- START OF CONTEXT FOR GROUP "${item.name}" ---\n${groupContext}\n--- END OF CONTEXT FOR GROUP "${item.name}" ---`;
    } else {
      const fileContent = await invoke<string>("get_file_content", {
        rootPathStr: rootPath,
        fileRelPath: item.id,
      });
      return `--- START OF FILE ${item.name} ---\n${fileContent}\n--- END OF FILE ${item.name} ---`;
    }
  });
  const allContents = await Promise.all(contentPromises);
  return allContents.join("\n\n");
};

export const createAiChatActions: StateCreator<
  AppState,
  [],
  [],
  AiChatActions
> = (set, get) => ({
  sendChatMessage: async (prompt: string) => {
    const {
      openRouterApiKey,
      googleApiKey,
      rootPath,
      allAvailableModels,
      selectedAiModel,
      editingMessageIndex,
      actions,
    } = get();
    // Reset editing state regardless of the outcome
    set({ editingMessageIndex: null });

    if (editingMessageIndex !== null) {
      await actions._internal_editAndResubmit(
        prompt,
        editingMessageIndex
      );
      return;
    }
    const model = allAvailableModels.find((m) => m.id === selectedAiModel);
    const aiAttachedFiles = get().aiAttachedFiles;

    if (
      (model?.provider === "openrouter" && !openRouterApiKey) ||
      (model?.provider === "google" && !googleApiKey)
    ) {
      return;
    }

    set({ isAiPanelLoading: true });

    try {
      let currentSession = get().activeChatSession;

      if (!currentSession) {
        const { activeProfile } = get();
        if (!rootPath || !activeProfile) {
          throw new Error("Project path or profile not set.");
        }
        const newSession = await invoke<AIChatSession>("create_chat_session", {
          projectPath: rootPath,
          profileName: activeProfile,
          title: prompt.substring(0, 50),
        });

        currentSession = newSession;

        set((state) => ({
          activeChatSession: newSession,
          activeChatSessionId: newSession.id,
          chatMessages: [],
          chatSessions: [
            {
              id: newSession.id,
              title: newSession.title,
              createdAt: newSession.createdAt,
            },
            ...state.chatSessions,
          ],
        }));
      }

      const hiddenContent = await _generateHiddenContent(get, aiAttachedFiles);
      const newUserMessage: ChatMessage = {
        role: "user",
        content: prompt,
        hiddenContent,
        attachedFiles: [...aiAttachedFiles],
      };

      const newMessages = [...get().chatMessages, newUserMessage];
      set({ chatMessages: newMessages });

      await get().actions.saveCurrentChatSession(newMessages);

      get().actions.clearAttachedFilesFromAi();

      await get().actions.fetchAiResponse();
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.name !== "AbortError"
          ? error.message
          : String(error);
      console.error("Error in sendChatMessage:", errorMessage);
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      const assistantErrorMessage: ChatMessage = {
        role: "assistant",
        content: `${t("aiPanel.error")}\n\n${errorMessage}`,
      };
      set((state) => ({
        chatMessages: [...state.chatMessages, assistantErrorMessage],
        isAiPanelLoading: false,
      }));
      await get().actions.saveCurrentChatSession();
    }
  },
  fetchAiResponse: async () => {
    const {
      openRouterApiKey,
      googleApiKey,
      nvidiaApiKey,
      allAvailableModels,
      aiModels,
      selectedAiModel,
      chatMessages,
      activeChatSession,
      streamResponse,
      systemPrompt,
      temperature,
      topP,
      topK,
      maxTokens,
      aiChatMode,
    } = get();
    const { editingGroupId } = get();

    const controller = new AbortController();
    set({ abortController: controller });

    const model = allAvailableModels.find((m) => m.id === selectedAiModel);
    if (!model || !activeChatSession) return;

    const actualApiKey = model.provider === "google" ? googleApiKey : (model.provider === "nvidia" ? nvidiaApiKey : openRouterApiKey);
    if (!actualApiKey) {
      console.error(`API key for ${model.provider} is not set.`);
      set({ isAiPanelLoading: false });
      return;
    }
    const messagesToSend: ChatMessage[] = [];
    if (systemPrompt && systemPrompt.trim()) {
      messagesToSend.push({ role: "system", content: systemPrompt });
    }
    messagesToSend.push(...chatMessages);

    if (model.provider === "google") {
      const tools = getGoogleTools(aiChatMode, editingGroupId);
      const payload = toGooglePayload(messagesToSend, {
        systemPrompt,
        temperature,
        topP,
        topK,
        maxTokens,
        tools,
      });

      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${
          model.id
        }:${streamResponse ? "streamGenerateContent" : "generateContent"}`;
        const response = await tauriFetch(endpoint, {
          method: "POST",
          headers: {
            "x-goog-api-key": actualApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error?.message || response.statusText);
        }

        if (streamResponse) {
          await handleStreamingResponseGoogle(response, {
            getState: get,
            setState: set,
          });
        } else {
          const assistantMessage = await handleNonStreamingResponseGoogle(
            response
          );
          set((state) => ({
            chatMessages: [...state.chatMessages, assistantMessage],
          }));
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          console.log("AI response aborted by user.");
          return;
        }
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error("Google AI API error:", errorMessage);

        const assistantErrorMessage: ChatMessage = {
          role: "assistant",
          content: `${t("aiPanel.error")}\n\n${errorMessage}`,
        };

        set((state) => ({
          chatMessages: [...state.chatMessages, assistantErrorMessage],
        }));
      } finally {
        set({ isAiPanelLoading: false, abortController: null });
        await get().actions.saveCurrentChatSession();
      }
    } else {
      const tools = getOpenRouterTools(aiChatMode, editingGroupId);
      const payload: Record<string, any> = {
        model: selectedAiModel || aiModels[0]?.id,
        messages: messagesToSend.map(
          ({ hidden, hiddenContent, attachedFiles, ...msg }) => {
            const fullContent = (hiddenContent || "") + (msg.content || "");
            return { ...msg, content: fullContent };
          }
        ),
        tools,
      };

      try {
        const endpointUrl = model.provider === "nvidia" 
          ? "https://integrate.api.nvidia.com/v1/chat/completions"
          : "https://openrouter.ai/api/v1/chat/completions";

        const response = await tauriFetch(
          endpointUrl,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${actualApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ 
              ...payload, 
              stream: streamResponse,
              ...(streamResponse ? { stream_options: { include_usage: true } } : {})
            }),
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error?.message || response.statusText);
        }

        if (streamResponse) {
          await handleStreamingResponse(response, {
            getState: get,
            setState: set,
          });
        } else {
          const assistantMessage = await handleNonStreamingResponse(
            response,
            actualApiKey,
            model.provider === "openrouter"
          );
          set((state) => ({
            chatMessages: [...state.chatMessages, assistantMessage],
          }));
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          console.log("AI response aborted by user.");
          return;
        }
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error("OpenRouter API error:", errorMessage);

        const assistantErrorMessage: ChatMessage = {
          role: "assistant",
          content: `${t("aiPanel.error")}\n\n${errorMessage}`,
        };

        set((state) => ({
          chatMessages: [...state.chatMessages, assistantErrorMessage],
        }));
      } finally {
        set({ isAiPanelLoading: false });
        set({ abortController: null });
        await get().actions.saveCurrentChatSession();
      }
    }
  },

  stopAiResponse: () => {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
      set({
        abortController: null,
        isAiPanelLoading: false,
      });
    }
  },

  regenerateResponse: async (fromIndex: number) => {
    if (get().isAiPanelLoading) {
      get().actions.stopAiResponse();
    }
    const { chatMessages } = get();

    let lastUserMessageIndex = -1;
    for (let i = fromIndex - 1; i >= 0; i--) {
      if (chatMessages[i].role === "user" && !chatMessages[i].hidden) {
        lastUserMessageIndex = i;
        break;
      }
    }

    if (lastUserMessageIndex === -1) {
      console.error(
        "Could not find a visible user message to regenerate from."
      );
      return;
    }

    const truncatedMessages = chatMessages.slice(0, lastUserMessageIndex + 1);

    set({ isAiPanelLoading: true, chatMessages: truncatedMessages });

    try {
      await get().actions.saveCurrentChatSession(truncatedMessages);
      await get().actions.fetchAiResponse();
    } catch (error) {
      console.error("Error during regeneration:", error);
      set({ isAiPanelLoading: false });
    }
  },

  _internal_editAndResubmit: async (
    newPrompt: string,
    fromIndex: number
  ) => {
    set({ editingMessageIndex: null });
    if (get().isAiPanelLoading) {
      get().actions.stopAiResponse();
    }

    const { chatMessages, aiAttachedFiles } = get();

    const truncatedMessages = chatMessages.slice(0, fromIndex);

    const hiddenContent = await _generateHiddenContent(get, aiAttachedFiles);

    const newUserMessage: ChatMessage = {
      role: "user",
      content: newPrompt,
      hiddenContent,
      attachedFiles: [...aiAttachedFiles],
    };

    const finalMessages = [...truncatedMessages, newUserMessage];

    set({
      isAiPanelLoading: true,
      chatMessages: finalMessages,
    });

    get().actions.clearAttachedFilesFromAi();

    await get().actions.saveCurrentChatSession(finalMessages);
    await get().actions.fetchAiResponse();
  },
});
