// src/store/types.ts

export interface CachedProjectData {
  stats: ProjectStats | null;
  file_tree: FileNode | null;
  groups: Group[];
  file_metadata_cache: Record<string, FileMetadata>;
  sync_enabled?: boolean | null;
  sync_path?: string | null;
  data_hash?: string | null;
  custom_ignore_patterns?: string[]; // <-- Sửa thành snake_case
  is_watching_files?: boolean | null; // <-- THÊM TRƯỜNG MỚI
  export_use_full_tree?: boolean | null; // <-- THÊM TRƯỜNG MỚI NÀY
  export_only_tree?: boolean | null;
  export_with_line_numbers?: boolean | null; // <-- THÊM TRƯỜNG MỚI
  export_without_comments?: boolean | null; // <-- THÊM TRƯỜNG MỚI
  export_remove_debug_logs?: boolean | null; // <-- THÊM TRƯỜNG MỚI
  export_super_compressed?: boolean | null;
  export_claude_mode?: boolean | null;
  export_dummy_logic?: boolean | null;
  always_apply_text?: string | null;
  append_ide_prompt?: boolean | null;
  append_group_prompt?: boolean | null;
  export_exclude_extensions?: string[];
  git_export_mode_is_context?: boolean | null;
}

export interface FileNode {
  name: string;
  path: string;
  children?: FileNode[] | null;
}

export interface GroupStats {
  total_files: number;
  total_dirs: number;
  total_size: number;
  token_count: number;
}

export interface FileMetadata {
  size: number;
  mtime: number;
  token_count: number;
  excluded_ranges?: [number, number][]; // <-- THÊM TRƯỜNG MỚI
}

export interface ProjectStats {
  total_files: number;
  total_dirs: number;
  total_size: number;
  total_tokens: number;
}

export interface ScanProgress {
  currentFile: string | null;
  currentPhase: "scanning" | "analyzing";
}

export interface Group {
  id: string;
  name: string;
  paths: string[];
  stats: GroupStats;
  tokenLimit?: number; // <-- THÊM TRƯỜNG NÀY
}

export interface AIGroupUpdateResult {
  updatedGroup: Group;
  finalExpandedFiles: string[];
}

export interface ScanCompletePayload {
  projectData: CachedProjectData;
  isFirstScan: boolean;
}

export type AiChatMode = "ask" | "context" | "mc";

export interface AIModel {
  provider: "openrouter" | "google" | "nvidia";
  id: string;
  name: string;
  context_length: number | null;
  pricing: {
    prompt: string;
    completion: string;
  };
}

export interface AppSettings {
  recentPaths: string[];
  nonAnalyzableExtensions?: string[];
  nonAnalyzableFolders?: string[];
  openRouterApiKey?: string;
  aiModels?: string[];
  googleApiKey?: string;
  nvidiaApiKey?: string;
  streamResponse?: boolean;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  geminiThinkingLevel?: "MINIMAL" | "LOW" | "MEDIUM" | "HIGH";
  selectedKiloModel?: string;
  kiloPort?: number;
  patchPort?: number;
  discordWebhookUrl?: string;
}

export interface GitRepositoryInfo {
  isRepository: boolean;
  currentBranch: string | null;
  remoteUrl: string | null;
  currentSha: string | null;
  mainBranchHeadSha: string | null;
}

export interface GitCommit {
  sha: string;
  author: string;
  date: string;
  message: string;
}

export interface GitStatus {
  files: Record<string, string>; // path -> status code
}

export type GitLogState = "idle" | "loading_repo" | "loading_commits" | "error";

export interface GenerationInfo {
  tokens_prompt: number;
  tokens_completion: number;
  total_cost: number;
}

export interface AttachedItem {
  id: string; // file path, folder path, or group ID
  type: "file" | "folder" | "group";
  name: string; // display name
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | null; // Allow null content for tool calls
  thoughts?: string; // Reasoning content from AI
  attachedFiles?: AttachedItem[]; // Files attached to this specific message
  hiddenContent?: string;
  generationInfo?: GenerationInfo;
  tool_calls?: ToolCall[]; // Add tool_calls
  hidden?: boolean; // For hidden user messages
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
  status?: "success" | "error"; // To track execution status for UI
  result?: string; // Store result text for terminal UI
}

export interface PatchOpUI {
  id: string;
  file: string;
  opType: 'modify' | 'create' | 'delete' | 'rename' | 'mkdir';
  status: 'pending' | 'success' | 'error';
  message: string;
}

export interface AIChatSessionHeader {
  id: string;
  title: string;
  createdAt: string; // ISO string from backend
}

export interface AIChatSession {
  id: string;
  title: string;
  createdAt: string;
  messages: ChatMessage[];
  totalTokens?: number;
  totalCost?: number;
}

export interface KiloModelInfo {
  id: string;
  label: string;
}

export interface AiFileActions {
  attachItemToAi: (item: AttachedItem) => void;
  detachItemFromAi: (itemId: string) => void;
  clearAttachedFilesFromAi: () => void;
}

export interface AppState {
  rootPath: string | null;
  selectedPath: string | null;
  allGroups: Map<string, Group[]>;
  groups: Group[]; // Derived state

  // Dữ liệu quét chung
  projectStats: ProjectStats | null;
  fileTree: FileNode | null;
  fileMetadataCache: Record<string, FileMetadata> | null;

  // State giao diện
  activeScene: "dashboard" | "settings"; // Deprecated by activeView
  editingGroupId: string | null;
  inlineEditingGroup: {
    mode: "create" | "rename";
    profileName: string;
    groupId?: string;
  } | null;
  isScanning: boolean;
  isRescanning: boolean;
  scanProgress: ScanProgress;
  isUpdatingGroupId: string | null;
  tempSelectedPaths: Set<string> | null;
  isGroupEditorPanelVisible: boolean;
  isEditorPanelVisible: boolean;
  activeEditorFile: string | null;
  activeEditorFileContent: string | null;
  isEditorLoading: boolean;
  activeEditorFileExclusions: [number, number][] | null;

  // Dữ liệu riêng của hồ sơ active
  syncEnabled: boolean;
  syncPath: string | null;
  customIgnorePatterns: string[];
  isWatchingFiles: boolean;
  exportUseFullTree: boolean;
  exportOnlyTree: boolean;
  exportWithLineNumbers: boolean;
  exportWithoutComments: boolean;
  exportRemoveDebugLogs: boolean;
  exportSuperCompressed: boolean;
  exportClaudeMode: boolean;
  exportDummyLogic: boolean;
  alwaysApplyText: string | null;
  appendIdePrompt: boolean;
  appendGroupPrompt: boolean;
  exportExcludeExtensions: string[];
  gitExportModeIsContext: boolean;

  // Quản lý hồ sơ
  profiles: string[];
  activeProfile: string;
  isSidebarVisible: boolean;
  recentPaths: string[];
  nonAnalyzableExtensions: string[];
  nonAnalyzableFolders: string[];

  // Git Panel
  isGitPanelVisible: boolean;
  gitRepoInfo: GitRepositoryInfo | null;
  gitStatus: GitStatus | null;
  gitCommits: GitCommit[];
  gitLogState: "idle" | "loading_repo" | "loading_commits" | "error";
  gitCurrentPage: number;
  hasMoreCommits: boolean;
  originalGitBranch: string | null; // <-- THÊM STATE MỚI
  gitBranches: string[];

  // Kilo Panel
  isKiloPanelVisible: boolean;
  isKiloServerRunning: boolean;
  kiloLogs: string[];
  isKiloInstalled: boolean | null;
  selectedKiloModel: string;
  kiloAvailableModels: KiloModelInfo[];
  kiloTaskStatus: "idle" | "running" | "success" | "error";

  // Patch Panel
  isPatchPanelVisible: boolean;
  isPatchServerRunning: boolean;
  patchLogs: string[];
  patchTaskStatus: "idle" | "running" | "success" | "error";

  // AI Panel
  isAiPanelVisible: boolean;
  aiChatMode: AiChatMode;
  openRouterApiKey: string;
  googleApiKey: string;
  nvidiaApiKey: string;
  allAvailableModels: AIModel[];
  aiModels: AIModel[];
  chatMessages: ChatMessage[];
  isAiPanelLoading: boolean;
  chatSessions: AIChatSessionHeader[];
  activeChatSessionId: string | null;
  abortController: AbortController | null;
  activeChatSession: AIChatSession | null;
  temperature: number;
  topP: number;
  topK: number;
  maxTokens: number;
  geminiThinkingLevel: "MINIMAL" | "LOW" | "MEDIUM" | "HIGH";
  systemPrompt: string;
  streamResponse: boolean;
  selectedAiModel: string;
  editingMessageIndex: number | null;
  aiAttachedFiles: AttachedItem[];
  kiloPort: number;
  patchPort: number;
  discordWebhookUrl: string;
}
