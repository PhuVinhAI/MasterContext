// src/store/actions/settingsActions.ts
import { StateCreator } from "zustand";
import { AppState } from "../appStore";
import { invoke } from "@tauri-apps/api/core";
import { type AppSettings } from "../types";
import { message } from "@tauri-apps/plugin-dialog";

/**
 * Helper tái sử dụng cho các setter export toggle: optimistic update + invoke + rollback.
 */
const _persistExportToggle = async (
  rootPath: string,
  activeProfile: string,
  invokeCmd: string,
  value: boolean,
  onError: () => void,
  errorMsg: string
) => {
  try {
    await invoke(invokeCmd, { path: rootPath, profileName: activeProfile, enabled: value });
  } catch (error) {
    await message(`${errorMsg}: ${error}`, { title: "Lỗi", kind: "error" });
    onError();
  }
};

export interface SettingsActions {
  setSyncSettings: (settings: {
    enabled: boolean;
    path: string | null;
  }) => Promise<void>;
  setCustomIgnorePatterns: (patterns: string[]) => Promise<void>;
  setFileWatching: (enabled: boolean) => Promise<void>;
  setExportUseFullTree: (enabled: boolean) => Promise<void>;
  setExportOnlyTree: (enabled: boolean) => Promise<void>;
  setExportWithLineNumbers: (enabled: boolean) => Promise<void>;
  setExportWithoutComments: (enabled: boolean) => Promise<void>;
  setExportRemoveDebugLogs: (enabled: boolean) => Promise<void>;
  setExportSuperCompressed: (enabled: boolean) => Promise<void>;
  setExportClaudeMode: (enabled: boolean) => Promise<void>;
  setExportDummyLogic: (enabled: boolean) => Promise<void>;
  setAlwaysApplyText: (text: string) => Promise<void>;
  setAppendIdePrompt: (enabled: boolean) => Promise<void>;
  setAppendGroupPrompt: (enabled: boolean) => Promise<void>;
  setAppendJulesPrompt: (enabled: boolean) => Promise<void>;
  setExportExcludeExtensions: (extensions: string[]) => Promise<void>;
  setGitExportMode: (enabled: boolean) => Promise<void>;
  updateAppSettings: (settings: Partial<Omit<AppSettings, 'nvidiaApiKey'>>) => Promise<void>;
}

export const createSettingsActions: StateCreator<
  AppState,
  [],
  [],
  SettingsActions
> = (set, get, _store) => ({
  setSyncSettings: async ({ enabled, path }) => {
    const { rootPath, activeProfile } = get();
    if (!rootPath) return;

    set({ syncEnabled: enabled, syncPath: path });

    try {
      await invoke("update_sync_settings", {
        path: rootPath,
        profileName: activeProfile,
        enabled,
        syncPath: path,
      });
    } catch (error) {
      console.error("Lỗi khi lưu cài đặt đồng bộ:", error);
      await message("Không thể lưu cài đặt đồng bộ.", {
        title: "Lỗi",
        kind: "error",
      });
    }
  },
  setCustomIgnorePatterns: async (patterns: string[]) => {
    const { rootPath, activeProfile } = get();
    if (!rootPath) return;

    set({ customIgnorePatterns: patterns });

    try {
      await invoke("update_custom_ignore_patterns", {
        path: rootPath,
        profileName: activeProfile,
        patterns,
      });
      await get().actions.rescanProject();
    } catch (error) {
      console.error("Lỗi khi lưu các mẫu loại trừ tùy chỉnh:", error);
      await message("Không thể lưu các mẫu loại trừ.", {
        title: "Lỗi",
        kind: "error",
      });
    }
  },
  setFileWatching: async (enabled: boolean) => {
    const { rootPath, activeProfile } = get();
    if (!rootPath) return;

    try {
      await invoke("set_file_watching_setting", {
        path: rootPath,
        profileName: activeProfile,
        enabled,
      });
    } catch (error) {
      await message(`Không thể lưu cài đặt: ${error}`, {
        title: "Lỗi",
        kind: "error",
      });
      return;
    }

    set({ isWatchingFiles: enabled });

    try {
      if (enabled) {
        await invoke("start_file_watching", { path: rootPath });
      } else {
        await invoke("stop_file_watching");
      }
    } catch (error) {
      await message(`Không thể ${enabled ? "bật" : "tắt"} theo dõi: ${error}`, {
        title: "Lỗi",
        kind: "error",
      });
      set({ isWatchingFiles: !enabled });
    }
  },
  setExportUseFullTree: async (enabled: boolean) => {
    const { rootPath, activeProfile } = get();
    if (!rootPath) return;
    set({ exportUseFullTree: enabled });
    await _persistExportToggle(rootPath, activeProfile, "set_export_use_full_tree_setting", enabled,
      () => set((s) => ({ exportUseFullTree: !s.exportUseFullTree })),
      "Không thể lưu cài đặt xuất file");
  },
  setExportOnlyTree: async (enabled: boolean) => {
    const { rootPath, activeProfile } = get();
    if (!rootPath) return;
    set({ exportOnlyTree: enabled });
    await _persistExportToggle(rootPath, activeProfile, "set_export_only_tree_setting", enabled,
      () => set((s) => ({ exportOnlyTree: !s.exportOnlyTree })),
      "Không thể lưu cài đặt xuất cây");
  },
  setExportWithLineNumbers: async (enabled: boolean) => {
    const { rootPath, activeProfile } = get();
    if (!rootPath) return;
    set({ exportWithLineNumbers: enabled });
    await _persistExportToggle(rootPath, activeProfile, "set_export_with_line_numbers_setting", enabled,
      () => set((s) => ({ exportWithLineNumbers: !s.exportWithLineNumbers })),
      "Không thể lưu cài đặt số dòng");
  },
  setExportWithoutComments: async (enabled: boolean) => {
    const { rootPath, activeProfile } = get();
    if (!rootPath) return;
    set({ exportWithoutComments: enabled });
    await _persistExportToggle(rootPath, activeProfile, "set_export_without_comments_setting", enabled,
      () => set((s) => ({ exportWithoutComments: !s.exportWithoutComments })),
      "Không thể lưu cài đặt loại bỏ chú thích");
  },
  setExportRemoveDebugLogs: async (enabled: boolean) => {
    const { rootPath, activeProfile } = get();
    if (!rootPath) return;
    set({ exportRemoveDebugLogs: enabled });
    await _persistExportToggle(rootPath, activeProfile, "set_export_remove_debug_logs_setting", enabled,
      () => set((s) => ({ exportRemoveDebugLogs: !s.exportRemoveDebugLogs })),
      "Không thể lưu cài đặt loại bỏ debug logs");
  },
  setExportSuperCompressed: async (enabled: boolean) => {
    const { rootPath, activeProfile } = get();
    if (!rootPath) return;
    set({ exportSuperCompressed: enabled });
    await _persistExportToggle(rootPath, activeProfile, "set_export_super_compressed_setting", enabled,
      () => set((s) => ({ exportSuperCompressed: !s.exportSuperCompressed })),
      "Không thể lưu cài đặt xuất siêu nén");
  },
  setExportClaudeMode: async (enabled: boolean) => {
    const { rootPath, activeProfile } = get();
    if (!rootPath) return;
    set({ exportClaudeMode: enabled });
    await _persistExportToggle(rootPath, activeProfile, "set_export_claude_mode_setting", enabled,
      () => set((s) => ({ exportClaudeMode: !s.exportClaudeMode })),
      "Không thể lưu cài đặt Claude Mode");
  },
  setExportDummyLogic: async (enabled: boolean) => {
    const { rootPath, activeProfile } = get();
    if (!rootPath) return;
    set({ exportDummyLogic: enabled });
    await _persistExportToggle(rootPath, activeProfile, "set_export_dummy_logic_setting", enabled,
      () => set((s) => ({ exportDummyLogic: !s.exportDummyLogic })),
      "Không thể lưu cài đặt Dummy Logic");
  },
  setAlwaysApplyText: async (text: string) => {
    const { rootPath, activeProfile } = get();
    if (!rootPath) return;
    set({ alwaysApplyText: text });
    try {
      await invoke("set_always_apply_text_setting", {
        path: rootPath,
        profileName: activeProfile,
        text,
      });
    } catch (error) {
      message(`Không thể lưu văn bản: ${error}`, {
        title: "Lỗi",
        kind: "error",
      });
    }
  },
  setAppendIdePrompt: async (enabled: boolean) => {
    const { rootPath, activeProfile } = get();
    if (!rootPath) return;
    set({ appendIdePrompt: enabled });
    await _persistExportToggle(rootPath, activeProfile, "set_append_ide_prompt_setting", enabled,
      () => set((s) => ({ appendIdePrompt: !s.appendIdePrompt })),
      "Không thể lưu cài đặt Prompt IDE");
  },
  setAppendGroupPrompt: async (enabled: boolean) => {
    const { rootPath, activeProfile } = get();
    if (!rootPath) return;
    set({ appendGroupPrompt: enabled });
    await _persistExportToggle(rootPath, activeProfile, "set_append_group_prompt_setting", enabled,
      () => set((s) => ({ appendGroupPrompt: !s.appendGroupPrompt })),
      "Không thể lưu cài đặt Prompt Nhóm");
  },
  setAppendJulesPrompt: async (enabled: boolean) => {
    const { rootPath, activeProfile } = get();
    if (!rootPath) return;
    set({ appendJulesPrompt: enabled });
    await _persistExportToggle(rootPath, activeProfile, "set_append_jules_prompt_setting", enabled,
      () => set((s) => ({ appendJulesPrompt: !s.appendJulesPrompt })),
      "Không thể lưu cài đặt Jules Prompt");
  },
  setExportExcludeExtensions: async (extensions: string[]) => {
    const { rootPath, activeProfile } = get();
    if (!rootPath) return;
    set({ exportExcludeExtensions: extensions });
    try {
      await invoke("set_export_exclude_extensions_setting", {
        path: rootPath,
        profileName: activeProfile,
        extensions,
      });
    } catch (error) {
      message(`Không thể lưu cài đặt loại trừ file: ${error}`, {
        title: "Lỗi",
        kind: "error",
      });
      // Revert on error? Or just log it. Let's just log and show message.
    }
  },
  setGitExportMode: async (enabled: boolean) => {
    const { rootPath, activeProfile } = get();
    if (!rootPath) return;
    set({ gitExportModeIsContext: enabled });
    await _persistExportToggle(rootPath, activeProfile, "set_git_export_mode_setting", enabled,
      () => set((s) => ({ gitExportModeIsContext: !s.gitExportModeIsContext })),
      "Không thể lưu cài đặt Git");
  },
  updateAppSettings: async (newSettings) => {
    const {
      recentPaths,
      nonAnalyzableExtensions,
      openRouterApiKey,
      googleApiKey,
      aiModels,
      allAvailableModels,
      streamResponse,
      systemPrompt,
      temperature,
      topP,
      topK,
      maxTokens,
    } = get();
    const fullSettings: AppSettings = {
      recentPaths: newSettings.recentPaths ?? recentPaths,
      nonAnalyzableExtensions:
        newSettings.nonAnalyzableExtensions ?? nonAnalyzableExtensions,
      openRouterApiKey: newSettings.openRouterApiKey ?? openRouterApiKey,
      googleApiKey: newSettings.googleApiKey ?? googleApiKey,
      aiModels: newSettings.aiModels ?? aiModels.map((m) => m.id),
      streamResponse: newSettings.streamResponse ?? streamResponse,
      systemPrompt: newSettings.systemPrompt ?? systemPrompt,
      temperature: newSettings.temperature ?? temperature,
      topP: newSettings.topP ?? topP,
      topK: newSettings.topK ?? topK,
      maxTokens: newSettings.maxTokens ?? maxTokens,
      selectedKiloModel: newSettings.selectedKiloModel ?? get().selectedKiloModel,
      kiloPort: newSettings.kiloPort ?? get().kiloPort,
    };

    try {
      await invoke("update_app_settings", { settings: fullSettings });

      // Đồng bộ model Kilo xuống Backend (Rust) ngay lập tức để áp dụng ngay cho lần chạy tiếp theo
      if (fullSettings.selectedKiloModel) {
        await invoke("set_kilo_model", { model: fullSettings.selectedKiloModel }).catch(console.error);
      }

      const projectAiModels: AppState["aiModels"] = (
        fullSettings.aiModels ?? ["openai/gpt-3.5-turbo"]
      )
        .map((id) => allAvailableModels.find((m) => m.id === id))
        .filter((m): m is AppState["aiModels"][0] => !!m);

      set({
        recentPaths: fullSettings.recentPaths,
        nonAnalyzableExtensions: fullSettings.nonAnalyzableExtensions,
        openRouterApiKey: fullSettings.openRouterApiKey ?? "",
        googleApiKey: fullSettings.googleApiKey ?? "",
        aiModels: projectAiModels.length
          ? projectAiModels
          : [
              allAvailableModels.find((m) => m.id === "openai/gpt-3.5-turbo")!,
            ].filter(Boolean),
        systemPrompt: fullSettings.systemPrompt ?? "",
        streamResponse: fullSettings.streamResponse ?? true,
        temperature: fullSettings.temperature ?? 1.0,
        topP: fullSettings.topP ?? 1.0,
        topK: fullSettings.topK ?? 0,
        maxTokens: fullSettings.maxTokens ?? 0,
        // Cập nhật model được chọn nếu danh sách thay đổi
        selectedAiModel:
          projectAiModels.find((m) => m.id === get().selectedAiModel)?.id ||
          projectAiModels[0]?.id ||
          "",
        // Đảm bảo Kilo Model cũng được cập nhật vào state khi load/update settings
        selectedKiloModel: fullSettings.selectedKiloModel,
        kiloPort: fullSettings.kiloPort,
      });
    } catch (e) {
      console.error("Failed to update app settings:", e);
      message(`Không thể lưu cài đặt: ${e}`, { title: "Lỗi", kind: "error" });
    }
  },
});
