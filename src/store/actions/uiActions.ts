// src/store/actions/uiActions.ts
import { StateCreator } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { type FileMetadata } from "../types";
import { AppState } from "../appStore";

export interface UIActions {
  reset: () => void;
  showDashboard: () => void;
  showSettingsScene: () => void;
  toggleProjectPanelVisibility: () => void;
  toggleGitPanelVisibility: () => void;
  toggleGroupEditorPanelVisibility: () => void;
  toggleAiPanelVisibility: () => void;
  toggleKiloPanelVisibility: () => void;
  toggleEditorPanelVisibility: () => void;
  setKiloServerStatus: (isRunning: boolean) => void;
  setKiloTaskStatus: (status: "idle" | "running" | "success" | "error") => void;
  addKiloLog: (log: string) => void;
  clearKiloLogs: () => void;
  startKiloServer: () => Promise<void>;
  stopKiloServer: () => Promise<void>;
  checkKiloInstalled: () => Promise<void>;
  installKiloCli: () => Promise<void>;
  fetchKiloModels: () => Promise<void>;
  setSelectedKiloModel: (model: string) => Promise<void>;
  openFileInEditor: (filePath: string) => Promise<void>;
  closeEditor: () => void;
  addExclusionRange: (start: number, end: number) => Promise<void>;
  removeExclusionRange: (rangeToRemove: [number, number]) => Promise<void>;
  clearExclusionRanges: () => Promise<void>;
  addExclusionRangeFromAI: (
    filePath: string,
    startLine: number,
    endLine: number
  ) => Promise<{ success: boolean; message: string }>;
  executeFileOperationFromAI: (
    toolName: "write_file" | "create_file" | "delete_file" | "rename_file" | "create_directory",
    args: any
  ) => Promise<{
    success: boolean;
    message: string;
  }>;
  setInlineEditingGroup: (
    state: { mode: "create" | "rename"; profileName: string; groupId?: string } | null
  ) => void;
  _setRecentPaths: (paths: string[]) => void;
}

export const createUIActions: StateCreator<AppState, [], [], UIActions> = (
  set,
  _get,
  _store
) => ({
  reset: () =>
    set({
      rootPath: null,
      selectedPath: null,
      allGroups: new Map(),
      groups: [],
      activeScene: "dashboard",
      editingGroupId: null,
      profiles: ["default"],
      activeProfile: "default",
      isGroupEditorPanelVisible: false,
    }),
  showDashboard: () => {
    set({ activeScene: "dashboard" });
  },
  showSettingsScene: () => {
    set({ activeScene: "settings" });
  },
  toggleProjectPanelVisibility: () => {
    set((state) => ({ isSidebarVisible: !state.isSidebarVisible }));
  },
  toggleGitPanelVisibility: () => {
    set((state) => ({ isGitPanelVisible: !state.isGitPanelVisible }));
  },
  toggleGroupEditorPanelVisibility: () => {
    set((state) => ({
      isGroupEditorPanelVisible: !state.isGroupEditorPanelVisible,
    }));
  },
  toggleAiPanelVisibility: () => {
    set((state) => ({
      isAiPanelVisible: !state.isAiPanelVisible,
    }));
  },
  toggleKiloPanelVisibility: () => {
    set((state) => ({
      isKiloPanelVisible: !state.isKiloPanelVisible,
    }));
  },
  setKiloServerStatus: (isRunning) => {
    set({ isKiloServerRunning: isRunning });
  },
  setKiloTaskStatus: (status) => {
    set({ kiloTaskStatus: status });
  },
  addKiloLog: (log) => {
    set((state) => {
      // Giới hạn max 500 dòng log để tránh lag UI
      const newLogs = [...state.kiloLogs, log];
      if (newLogs.length > 500) return { kiloLogs: newLogs.slice(newLogs.length - 500) };
      return { kiloLogs: newLogs };
    });
  },
  clearKiloLogs: () => set({ kiloLogs: [] }),
  startKiloServer: async () => {
    try {
      const { rootPath, kiloPort } = _get();
      if (rootPath) {
        await invoke("init_kilo_config", { projectPath: rootPath });
      }
      await invoke("start_kilo_server", { port: kiloPort });
    } catch (e) {
      console.error("Failed to start Kilo Server", e);
    }
  },
  stopKiloServer: async () => {
    try {
      await invoke("stop_kilo_server");
      // Chỉ cập nhật trạng thái tác vụ. 
      // Trạng thái Server (isKiloServerRunning) sẽ được cập nhật dựa vào event "kilo_status_changed" từ Rust
      // Điều này đảm bảo UI chờ Backend dọn dẹp sạch Port trước khi người dùng bấm bật lại.
      set({ kiloTaskStatus: "idle" });
    } catch (e) {
      console.error("Failed to stop Kilo Server", e);
    }
  },
  checkKiloInstalled: async () => {
    try {
      const installed = await invoke<boolean>("check_kilo_installed");
      set({ isKiloInstalled: installed });
    } catch {
      set({ isKiloInstalled: false });
    }
  },
  installKiloCli: async () => {
    try {
      set({ isKiloInstalled: null });
      await invoke("install_kilo_cli");
      set({ isKiloInstalled: true });
    } catch (e) {
      set({ isKiloInstalled: false });
      console.error(`Lỗi cài đặt Kilo CLI: ${e}`);
    }
  },
  fetchKiloModels: async () => {
    try {
      const rawLines = await invoke<string[]>("get_kilo_models");
      const models: {id: string, label: string}[] = [];
      
      rawLines.forEach(line => {
        const cleanLine = line.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
        if (!cleanLine || cleanLine.startsWith('---') || cleanLine.startsWith('===') || cleanLine.toLowerCase().includes('provider')) return;
        
        const parts = cleanLine.split(/\s+/);
        if (parts.length > 0) {
           let id = parts.find(p => p.includes('/')) || parts[0];
           models.push({ id, label: cleanLine });
        }
      });
      
      set({ kiloAvailableModels: models });
      
      const savedModel = _get().selectedKiloModel;
      const modelExists = models.some(m => m.id === savedModel);

      if (models.length > 0 && (!savedModel || !modelExists)) {
          _get().actions.setSelectedKiloModel(models[0].id);
      }
    } catch (e) {
      console.error("Failed to fetch Kilo models", e);
    }
  },
  setSelectedKiloModel: async (model: string) => {
    set({ selectedKiloModel: model });
    try {
      await invoke("set_kilo_model", { model });
      // Lưu lại model vào settings để ghi nhớ cho lần sau
      await _get().actions.updateAppSettings({ selectedKiloModel: model });
    } catch(e) {
      console.error("Failed to set kilo model", e);
    }
  },
  toggleEditorPanelVisibility: () => {
    set((state) => ({ isEditorPanelVisible: !state.isEditorPanelVisible }));
  },
  setInlineEditingGroup: (state) => set({ inlineEditingGroup: state }),
  _setRecentPaths: (paths) => set({ recentPaths: paths }),
  openFileInEditor: async (filePath: string) => {
    const { rootPath, isEditorLoading } = _get();
    if (!rootPath || isEditorLoading) return; // Only prevent re-opening if it's already loading

    set({
      isEditorLoading: true,
      activeEditorFile: filePath,
      activeEditorFileContent: null,
      isEditorPanelVisible: true,
    });

    try {
      const content = await invoke<string>("get_file_content", {
        rootPathStr: rootPath,
        fileRelPath: filePath,
      });
      const fileMeta = _get().fileMetadataCache?.[filePath];
      set({
        activeEditorFileContent: content,
        isEditorLoading: false,
        activeEditorFileExclusions: fileMeta?.excluded_ranges || [],
      });
    } catch (e) {
      console.error(`Failed to load file content for ${filePath}:`, e);
      set({
        activeEditorFileContent: `Error loading file: ${e}`,
        isEditorLoading: false,
      });
    }
  },
  closeEditor: () => {
    set({
      activeEditorFile: null,
      activeEditorFileContent: null,
      isEditorLoading: false,
      activeEditorFileExclusions: null,
      isEditorPanelVisible: false,
    });
  },
  addExclusionRange: async (start, end) => {
    const {
      rootPath,
      activeProfile,
      activeEditorFile,
      activeEditorFileExclusions,
    } = _get();
    if (!rootPath || !activeProfile || !activeEditorFile || start >= end)
      return;

    const newRanges = [
      ...(activeEditorFileExclusions || []),
      [start, end] as [number, number],
    ].sort((a, b) => a[0] - b[0]);

    const mergedRanges: [number, number][] = [];
    if (newRanges.length > 0) {
      let currentMerge = newRanges[0];
      for (let i = 1; i < newRanges.length; i++) {
        const nextRange = newRanges[i];
        if (nextRange[0] <= currentMerge[1]) {
          currentMerge[1] = Math.max(currentMerge[1], nextRange[1]);
        } else {
          mergedRanges.push(currentMerge);
          currentMerge = nextRange;
        }
      }
      mergedRanges.push(currentMerge);
    }

    set({ activeEditorFileExclusions: mergedRanges });

    try {
      const updatedMetadata = await invoke<FileMetadata>(
        "update_file_exclusions",
        {
          path: rootPath,
          profileName: activeProfile,
          fileRelPath: activeEditorFile,
          ranges: mergedRanges,
        }
      );
      _get().actions._updateFileMetadata(activeEditorFile, updatedMetadata);
    } catch (e) {
      console.error("Failed to save exclusion range:", e);
    }
  },
  removeExclusionRange: async (rangeToRemove) => {
    const {
      rootPath,
      activeProfile,
      activeEditorFile,
      activeEditorFileExclusions,
    } = _get();
    if (
      !rootPath ||
      !activeProfile ||
      !activeEditorFile ||
      !activeEditorFileExclusions
    )
      return;
    const newRanges = activeEditorFileExclusions.filter(
      (r) => r[0] !== rangeToRemove[0] || r[1] !== rangeToRemove[1]
    );
    set({ activeEditorFileExclusions: newRanges });
    try {
      const updatedMetadata = await invoke<FileMetadata>(
        "update_file_exclusions",
        {
          path: rootPath,
          profileName: activeProfile,
          fileRelPath: activeEditorFile,
          ranges: newRanges,
        }
      );
      _get().actions._updateFileMetadata(activeEditorFile, updatedMetadata);
    } catch (e) {
      console.error("Failed to remove exclusion range:", e);
    }
  },
  clearExclusionRanges: async () => {
    set({ activeEditorFileExclusions: [] });
    const { rootPath, activeProfile, activeEditorFile } = _get();
    if (!rootPath || !activeProfile || !activeEditorFile) return;
    try {
      const updatedMetadata = await invoke<FileMetadata>(
        "update_file_exclusions",
        {
          path: rootPath,
          profileName: activeProfile,
          fileRelPath: activeEditorFile,
          ranges: [],
        }
      );
      _get().actions._updateFileMetadata(activeEditorFile, updatedMetadata);
    } catch (e) {
      console.error("Failed to clear exclusion ranges:", e);
    }
  },
  addExclusionRangeFromAI: async (filePath, startLine, endLine) => {
    const { rootPath, activeProfile, fileMetadataCache } = _get();
    if (!rootPath || !activeProfile) {
      return { success: false, message: "Error: Project path not found." };
    }
    if (startLine > endLine) {
      return {
        success: false,
        message: "Error: start_line cannot be greater than end_line.",
      };
    }

    try {
      const content = await invoke<string>("get_file_content", {
        rootPathStr: rootPath,
        fileRelPath: filePath,
      });

      const lines = content.split("\n");
      if (startLine > lines.length || endLine > lines.length) {
        return {
          success: false,
          message: `Error: Line numbers are out of bounds. File has ${lines.length} lines.`,
        };
      }

      let startOffset = 0;
      for (let i = 0; i < startLine - 1; i++) {
        startOffset += lines[i].length + 1;
      }

      let endOffset = startOffset;
      for (let i = startLine - 1; i < endLine; i++) {
        endOffset += lines[i].length + 1;
      }
      endOffset = Math.max(startOffset, endOffset - 1);

      const existingRanges =
        fileMetadataCache?.[filePath]?.excluded_ranges || [];

      const newRanges = [
        ...existingRanges,
        [startOffset, endOffset] as [number, number],
      ].sort((a, b) => a[0] - b[0]);

      const mergedRanges: [number, number][] = [];
      if (newRanges.length > 0) {
        let currentMerge = newRanges[0];
        for (let i = 1; i < newRanges.length; i++) {
          const nextRange = newRanges[i];
          if (nextRange[0] <= currentMerge[1]) {
            currentMerge[1] = Math.max(currentMerge[1], nextRange[1]);
          } else {
            mergedRanges.push(currentMerge);
            currentMerge = nextRange;
          }
        }
        mergedRanges.push(currentMerge);
      }

      const updatedMetadata = await invoke<FileMetadata>(
        "update_file_exclusions",
        {
          path: rootPath,
          profileName: activeProfile,
          fileRelPath: filePath,
          ranges: mergedRanges,
        }
      );
      _get().actions._updateFileMetadata(filePath, updatedMetadata);
      if (_get().activeEditorFile === filePath) {
        set({ activeEditorFileExclusions: mergedRanges });
      }

      return {
        success: true,
        message: `Successfully added exclusion range ${startLine}-${endLine} to ${filePath}.`,
      };
    } catch (e) {
      return {
        success: false,
        message: `Error processing exclusion for ${filePath}: ${String(e)}`,
      };
    }
  },
  executeFileOperationFromAI: async (toolName, args) => {
    const { rootPath } = _get();
    const { file_path } = args;
    if (!rootPath) {
      return {
        success: false,
        message: "Error: Project path not found.",
      };
    }

    try {
      if (toolName === "delete_file") {
        await invoke("delete_file", {
          rootPathStr: rootPath,
          fileRelPath: file_path,
        });
      } else if (toolName === "create_file") {
        await invoke("create_file", {
          rootPathStr: rootPath,
          fileRelPath: file_path,
          content: args.content || "",
        });
      } else if (toolName === "rename_file") {
        await invoke("rename_file", {
          rootPathStr: rootPath,
          oldRelPath: args.old_path,
          newRelPath: args.new_path,
        });
      } else if (toolName === "create_directory") {
        await invoke("create_directory", {
          rootPathStr: rootPath,
          dirRelPath: args.dir_path,
        });
      } else if (toolName === "write_file") {
        const originalContent = await invoke<string>("get_file_content", {
          rootPathStr: rootPath,
          fileRelPath: file_path,
        });
        const finalContent = applyLineChanges(
          originalContent,
          args.content,
          args.start_line,
          args.end_line
        );
        await invoke("save_file_content", {
          rootPathStr: rootPath,
          fileRelPath: file_path,
          content: finalContent,
        });
      }

      // Quét lại ngay lập tức để cập nhật UI
      _get().actions.rescanProject();

      return {
        success: true,
        message: `Successfully executed ${toolName} on ${file_path}.`,
      };
    } catch (e) {
      return {
        success: false,
        message: `Error during file operation for ${file_path}: ${String(e)}`,
      };
    }
  },
});

// Helper function to apply line-based changes to content
const applyLineChanges = (
  originalContent: string,
  newContent: string,
  startLine?: number,
  endLine?: number
): string => {
  if (!startLine) {
    return newContent; // Overwrite whole file
  }
  const originalLines = originalContent.split("\n");
  const newLines = newContent.split("\n");
  const startIndex = startLine - 1;
  const endIndex = endLine ? endLine : startIndex;
  originalLines.splice(startIndex, endIndex - startIndex, ...newLines);
  return originalLines.join("\n");
};
