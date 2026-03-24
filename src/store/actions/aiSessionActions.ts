// src/store/actions/aiSessionActions.ts
import { StateCreator } from "zustand";
import { AppState } from "../appStore";
import {
  type ChatMessage,
  type AIChatSession,
  type AIChatSessionHeader,
} from "../types";
import { invoke } from "@tauri-apps/api/core";

export interface AiSessionActions {
  saveCurrentChatSession: (messagesOverride?: ChatMessage[]) => Promise<void>;
  createNewChatSession: () => void;
  loadChatSessions: () => Promise<void>;
  loadChatSession: (sessionId: string) => Promise<void>;
  deleteChatSession: (sessionId: string) => Promise<void>;
  updateChatSessionTitle: (
    sessionId: string,
    newTitle: string
  ) => Promise<void>;
  deleteAllChatSessions: () => Promise<void>;
}

export const createAiSessionActions: StateCreator<
  AppState,
  [],
  [],
  AiSessionActions
> = (set, get) => ({
  createNewChatSession: () => {
    set({
      chatMessages: [],
      activeChatSessionId: null,
      activeChatSession: null,
    });
  },
  loadChatSessions: async () => {
    const { rootPath, activeProfile } = get();
    if (!rootPath || !activeProfile) return;
    try {
      const sessions = await invoke<AIChatSessionHeader[]>(
        "list_chat_sessions",
        { projectPath: rootPath, profileName: activeProfile }
      );
      set({ chatSessions: sessions });
    } catch (e) {
      console.error("Failed to load chat sessions:", e);
      set({ chatSessions: [] });
    }
  },
  loadChatSession: async (sessionId: string) => {
    const { rootPath, activeProfile } = get();
    if (!rootPath || !activeProfile) return;
    try {
      const session = await invoke<AIChatSession>("load_chat_session", {
        projectPath: rootPath,
        profileName: activeProfile,
        sessionId,
      });
      set({
        activeChatSession: session,
        activeChatSessionId: session.id,
        chatMessages: session.messages,
      });
    } catch (e) {
      console.error(`Failed to load chat session ${sessionId}:`, e);
    }
  },
  deleteChatSession: async (sessionId: string) => {
    const { rootPath, activeProfile, activeChatSessionId } = get();
    if (!rootPath || !activeProfile) return;
    await invoke("delete_chat_session", {
      projectPath: rootPath,
      profileName: activeProfile,
      sessionId,
    });
    set((state) => ({
      chatSessions: state.chatSessions.filter((s) => s.id !== sessionId),
    }));
    if (activeChatSessionId === sessionId) {
      get().actions.createNewChatSession();
    }
  },
  updateChatSessionTitle: async (sessionId: string, newTitle: string) => {
    const { rootPath, activeProfile } = get();
    if (!rootPath || !activeProfile) return;
    await invoke("update_chat_session_title", {
      projectPath: rootPath,
      profileName: activeProfile,
      sessionId,
      newTitle,
    });
    set((state) => ({
      chatSessions: state.chatSessions.map((s) =>
        s.id === sessionId ? { ...s, title: newTitle } : s
      ),
    }));
  },
  deleteAllChatSessions: async () => {
    const { rootPath, activeProfile } = get();
    if (!rootPath || !activeProfile) return;
    try {
      await invoke("delete_all_chat_sessions", {
        projectPath: rootPath,
        profileName: activeProfile,
      });
      set({ chatSessions: [] });
      get().actions.createNewChatSession();
    } catch (e) {
      console.error("Failed to delete all chat sessions:", e);
    }
  },
  saveCurrentChatSession: async (messagesOverride?: ChatMessage[]) => {
    const {
      rootPath,
      activeProfile,
      activeChatSession,
      chatMessages: currentMessages,
    } = get();
    if (rootPath && activeProfile && activeChatSession) {
      const messagesToSave = messagesOverride ?? currentMessages;

      // Tính tổng token và cost từ TẤT CẢ các tin nhắn (cộng dồn mỗi lần AI phản hồi hoặc gọi tool)
      let totalTokens: number = 0;
      let totalCost: number = 0;
      let hasInfo = false;

      for (const msg of messagesToSave) {
        if (msg.generationInfo) {
          hasInfo = true;
          totalTokens +=
            (msg.generationInfo.tokens_prompt || 0) +
            (msg.generationInfo.tokens_completion || 0);
          totalCost += msg.generationInfo.total_cost || 0;
        }
      }

      const sessionToSave: AIChatSession = {
        ...activeChatSession,
        messages: messagesToSave,
        totalTokens:
          hasInfo && totalTokens > 0
            ? totalTokens
            : undefined,
        totalCost:
          hasInfo && totalCost > 0 ? totalCost : undefined,
      };
      await invoke("save_chat_session", {
        projectPath: rootPath,
        profileName: activeProfile,
        session: sessionToSave,
      });
      // Keep the state in sync after saving
      set({
        activeChatSession: sessionToSave,
      });
    }
  },
});
