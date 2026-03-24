import { useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import {
  CheckCircle2,
  FileText,
  Folder,
  ListChecks,
  Loader2,
  Scissors,
  XCircle,
  RotateCcw,
  Brain,
  ChevronDown,
  ChevronUp,
  FileEdit,
  Code,
  FileDiff,
  GitBranch,
  GitCommit,
  UploadCloud,
  FileSearch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type ChatMessage as ChatMessageType } from "@/store/types";
import { Button } from "@/components/ui/button";

interface ChatMessageProps {
  message: ChatMessageType;
  index: number;
  onRegenerate: (index: number) => void; // This will now trigger a dialog if needed
  isAiPanelLoading: boolean;
  isLastAssistantMessageInTurn: boolean;
  editingMessageIndex: number | null;
  onStartEdit: (index: number) => void;
}

export function ChatMessage({
  message,
  index,
  onRegenerate,
  isAiPanelLoading,
  isLastAssistantMessageInTurn,
  editingMessageIndex,
  onStartEdit,
}: ChatMessageProps) {
  const { t } = useTranslation();
  const [showThoughts, setShowThoughts] = useState(false);

  if (message.hidden) {
    return null;
  }

  const renderToolCall = (
    tool: NonNullable<ChatMessageType["tool_calls"]>[0]
  ) => {
    let toolContent: React.ReactNode;
    let ToolIcon: React.ElementType | null = null;

    switch (tool.function.name) {
      case "get_project_file_tree":
        toolContent = (
          <p className="font-medium text-foreground">
            {t("aiPanel.toolCall.listingFiles")}
          </p>
        );
        break;

      case "read_file":
        ToolIcon = FileText;
        try {
          const args = JSON.parse(tool.function.arguments);
          const filesToRead: any[] = args.files_to_read || (args.file_path ? [args] : []);

          toolContent = (
            <div className="w-full">
              <p className="font-medium text-foreground">
                {t("aiPanel.toolCall.readingFile")} ({filesToRead.length})
              </p>
              {filesToRead.length > 0 && (
                <pre className="mt-2 bg-muted/30 dark:bg-muted/20 p-2 rounded-md text-xs font-mono max-h-40 overflow-auto custom-scrollbar">
                  <code>
                    {filesToRead.map((f, idx) => {
                      const fileName = f.file_path?.split("/").pop() || "unknown";
                      let lineInfo = "";
                      if (f.start_line && f.end_line) lineInfo = `(${f.start_line}-${f.end_line})`;
                      else if (f.start_line) lineInfo = `(${f.start_line}-...)`;
                      else if (f.end_line) lineInfo = `(...-${f.end_line})`;

                      return (
                        <div
                          key={`read-${idx}`}
                          className="text-blue-600 dark:text-blue-400 whitespace-pre-wrap flex items-baseline gap-1.5"
                        >
                          <span className="select-none text-muted-foreground">• </span>
                          <span title={f.file_path}>{fileName}</span>
                          {lineInfo && <span className="text-muted-foreground text-[10px]">{lineInfo}</span>}
                        </div>
                      );
                    })}
                  </code>
                </pre>
              )}
            </div>
          );
        } catch (e) {
          toolContent = <p>{t("aiPanel.toolCall.readingFile")}</p>;
        }
        break;

      case "get_current_context_group_files":
        toolContent = (
          <p className="font-medium text-foreground">
            {t("aiPanel.toolCall.listingGroupFiles")}
          </p>
        );
        break;

      case "modify_context_group":
        try {
          const args = JSON.parse(tool.function.arguments);
          const filesToAdd: string[] = args.files_to_add || [];
          const filesToRemove: string[] = args.files_to_remove || [];

          toolContent = (
            <div className="w-full">
              <p className="font-medium text-foreground">
                {t("aiPanel.toolCall.modifiedGroup")}
              </p>
              {filesToAdd.length > 0 || filesToRemove.length > 0 ? (
                <pre className="mt-2 bg-muted/30 dark:bg-muted/20 p-2 rounded-md text-xs font-mono max-h-40 overflow-auto custom-scrollbar">
                  <code>
                    {filesToAdd.map((file) => (
                      <div
                        key={`add-${file}`}
                        className="text-green-600 dark:text-green-500 whitespace-pre-wrap"
                      >
                        <span className="select-none">+ </span>
                        {file}
                      </div>
                    ))}
                    {filesToRemove.map((file) => (
                      <div
                        key={`remove-${file}`}
                        className="text-red-600 dark:text-red-500 whitespace-pre-wrap"
                      >
                        <span className="select-none">- </span>
                        {file}
                      </div>
                    ))}
                  </code>
                </pre>
              ) : (
                <p className="text-xs text-muted-foreground italic mt-1">
                  No files were added or removed.
                </p>
              )}
            </div>
          );
        } catch (e) {
          toolContent = (
            <p className="font-medium text-foreground">
              {t("aiPanel.toolCall.modifiedGroup")}
            </p>
          );
        }
        break;

      case "add_exclusion_range_to_file":
        ToolIcon = Scissors;
        try {
          const args = JSON.parse(tool.function.arguments);
          const filePath = args.file_path ?? "unknown file";
          const fileName = filePath.split("/").pop() ?? filePath;
          const success = tool.status !== "error";
          const lineInfo = `${args.start_line}-${args.end_line}`;

          toolContent = (
            <div className="flex items-baseline gap-1.5">
              <span
                className={cn(
                  "font-medium",
                  success ? "text-foreground" : "text-destructive"
                )}
              >
                {t(
                  success
                    ? "aiPanel.toolCall.addedExclusion"
                    : "aiPanel.toolCall.addedExclusionError"
                )}
              </span>
              <code className="font-medium" title={filePath}>
                {fileName}
              </code>
              <span className="text-xs text-muted-foreground">
                ({lineInfo})
              </span>
            </div>
          );
        } catch (e) {
          toolContent = <p>{t("aiPanel.toolCall.addedExclusionError")}</p>;
        }
        break;

      case "get_dummy_project_context":
        ToolIcon = Brain;
        toolContent = (
          <p className="font-medium text-foreground">
            {t("aiPanel.toolCall.gettingDummyContext")}
          </p>
        );
        break;

      case "create_context_group":
        ToolIcon = Folder;
        try {
          const args = JSON.parse(tool.function.arguments);
          toolContent = (
            <p className="font-medium text-foreground">
              {t("aiPanel.toolCall.creatingGroup")} <code className="ml-1 px-1.5 py-0.5 bg-background rounded-md text-xs">{args.name}</code>
            </p>
          );
        } catch (e) {
          toolContent = <p className="font-medium text-foreground">{t("aiPanel.toolCall.creatingGroupFallback")}</p>;
        }
        break;

      case "manage_filesystem":
        ToolIcon = FileEdit;
        try {
          const args = JSON.parse(tool.function.arguments);
          const ops: any[] = args.operations || [];
          toolContent = (
            <div className="w-full">
              <p className="font-medium text-foreground">
                {t("aiPanel.toolCall.manageFilesystemCount", { count: ops.length })}
              </p>
              {ops.length > 0 && (
                <pre className="mt-2 bg-muted/30 dark:bg-muted/20 p-2 rounded-md text-xs font-mono max-h-40 overflow-auto custom-scrollbar">
                  <code>
                    {ops.map((op, idx) => (
                      <div key={idx} className="whitespace-pre-wrap flex items-baseline gap-1.5">
                         <span className="select-none text-muted-foreground">• </span>
                         <span className="text-purple-600 dark:text-purple-400 font-semibold">
                            [{t(`aiPanel.toolCall.actions.${op.action}` as any, { defaultValue: op.action })}]
                         </span>
                         <span title={op.path}>{op.path}</span>
                      </div>
                    ))}
                  </code>
                </pre>
              )}
            </div>
          );
        } catch (e) {
          toolContent = <p className="font-medium text-foreground">{t("aiPanel.toolCall.manageFilesystem")}</p>;
        }
        break;

      case "edit_file_by_lines":
        ToolIcon = Code;
        try {
          const args = JSON.parse(tool.function.arguments);
          const edits: any[] = args.edits || [];
          toolContent = (
            <div className="w-full">
              <p className="font-medium text-foreground">
                {t("aiPanel.toolCall.editFileByLinesCount", { count: edits.length })}
              </p>
              {edits.length > 0 && (
                <pre className="mt-2 bg-muted/30 dark:bg-muted/20 p-2 rounded-md text-xs font-mono max-h-40 overflow-auto custom-scrollbar">
                  <code>
                    {edits.map((edit, idx) => (
                      <div key={idx} className="whitespace-pre-wrap flex items-baseline gap-1.5">
                         <span className="select-none text-muted-foreground">• </span>
                         <span className="text-blue-600 dark:text-blue-400" title={edit.file_path}>{edit.file_path}</span>
                         <span className="text-muted-foreground text-[10px]">({edit.start_line}-{edit.end_line})</span>
                      </div>
                    ))}
                  </code>
                </pre>
              )}
            </div>
          );
        } catch (e) {
          toolContent = <p className="font-medium text-foreground">{t("aiPanel.toolCall.editFileByLines")}</p>;
        }
        break;

      case "apply_diff_blocks":
        ToolIcon = FileDiff;
        try {
          const args = JSON.parse(tool.function.arguments);
          const edits: any[] = args.edits || [];
          toolContent = (
            <div className="w-full">
              <p className="font-medium text-foreground">
                {t("aiPanel.toolCall.applyDiffBlocksCount", { count: edits.length })}
              </p>
              {edits.length > 0 && (
                <pre className="mt-2 bg-muted/30 dark:bg-muted/20 p-2 rounded-md text-xs font-mono max-h-40 overflow-auto custom-scrollbar">
                  <code>
                    {edits.map((edit, idx) => (
                      <div key={idx} className="whitespace-pre-wrap flex items-baseline gap-1.5">
                         <span className="select-none text-muted-foreground">• </span>
                         <span className="text-blue-600 dark:text-blue-400" title={edit.file_path}>{edit.file_path}</span>
                         <span className="text-muted-foreground text-[10px]">{edit.blocks?.length || 0} blocks</span>
                      </div>
                    ))}
                  </code>
                </pre>
              )}
            </div>
          );
        } catch (e) {
          toolContent = <p className="font-medium text-foreground">{t("aiPanel.toolCall.applyDiffBlocks")}</p>;
        }
        break;

      case "git_status":
        ToolIcon = FileSearch;
        toolContent = (
          <p className="font-medium text-foreground">
            {t("aiPanel.toolCall.gitStatus")}
          </p>
        );
        break;

      case "git_commit_all":
        ToolIcon = GitCommit;
        try {
          const args = JSON.parse(tool.function.arguments);
          toolContent = (
            <p className="font-medium text-foreground">
              {t("aiPanel.toolCall.gitCommitAll")} <code className="ml-1 text-xs text-muted-foreground">"{args.message}"</code>
            </p>
          );
        } catch (e) {
          toolContent = <p className="font-medium text-foreground">{t("aiPanel.toolCall.gitCommitAll")}</p>;
        }
        break;

      case "git_push":
        ToolIcon = UploadCloud;
        toolContent = (
          <p className="font-medium text-foreground">
            {t("aiPanel.toolCall.gitPush")}
          </p>
        );
        break;

      case "git_create_branch":
        ToolIcon = GitBranch;
        try {
          const args = JSON.parse(tool.function.arguments);
          toolContent = (
            <p className="font-medium text-foreground">
              {t("aiPanel.toolCall.gitCreateBranch")} <code className="ml-1 text-xs text-muted-foreground">{args.branch_name}</code>
            </p>
          );
        } catch (e) {
          toolContent = <p className="font-medium text-foreground">{t("aiPanel.toolCall.gitCreateBranch")}</p>;
        }
        break;

      case "git_switch_branch":
        ToolIcon = GitBranch;
        try {
          const args = JSON.parse(tool.function.arguments);
          toolContent = (
            <p className="font-medium text-foreground">
              {t("aiPanel.toolCall.gitSwitchBranch")} <code className="ml-1 text-xs text-muted-foreground">{args.branch_name}</code>
            </p>
          );
        } catch (e) {
          toolContent = <p className="font-medium text-foreground">{t("aiPanel.toolCall.gitSwitchBranch")}</p>;
        }
        break;

      case "git_delete_branch":
        ToolIcon = GitBranch;
        try {
          const args = JSON.parse(tool.function.arguments);
          toolContent = (
            <p className="font-medium text-foreground">
              {t("aiPanel.toolCall.gitDeleteBranch")} <code className="ml-1 text-xs text-muted-foreground line-through decoration-destructive">{args.branch_name}</code>
            </p>
          );
        } catch (e) {
          toolContent = <p className="font-medium text-foreground">{t("aiPanel.toolCall.gitDeleteBranch")}</p>;
        }
        break;

      default:
        toolContent = <p>{tool.function.name}</p>;
        break;
    }

    return (
      <div
        key={tool.id}
        className="flex text-sm bg-muted/60 dark:bg-muted/30 rounded-lg p-3 border w-full flex-row items-start gap-2.5"
      >
        <div className="flex items-center gap-1.5 shrink-0">
          {tool.status === "error" ? (
            <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
          )}
          {ToolIcon && (
            <ToolIcon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          )}
        </div>
        <div className="flex-1 w-full min-w-0">
          {toolContent}
        </div>
      </div>
    );
  };

  return (
    <div
      className={cn(
        "group flex w-full items-start gap-2 min-w-0",
        message.role === "user" ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "flex flex-col",
          message.role === "user" ? "items-end" : "items-start",
          "transition-all"
        )}
      >
      <div
        className={cn(
          message.role === "assistant" && message.tool_calls && message.tool_calls.length > 0
            ? "max-w-full lg:max-w-3xl w-full"
            : "max-w-xs md:max-w-md lg:max-w-lg",
          "text-sm rounded-lg",
          editingMessageIndex === index &&
            "ring-2 ring-primary ring-offset-2 ring-offset-background",
          message.role === "user" && !message.hidden && "cursor-pointer",
          message.role === "user"
            ? "bg-muted px-3 py-2 group-hover:bg-accent"
            : ""
        )}
          onClick={
            message.role === "user" && !message.hidden
              ? () => onStartEdit(index)
              : undefined
          }
        >
          {message.role === "user" ? (
            <div className="flex flex-col gap-2 w-full min-w-0 max-w-full">
              {message.attachedFiles && message.attachedFiles.length > 0 && (
                <div className="border-b border-background/50 pb-2">
                  <div className="flex flex-wrap gap-1.5">
                    {message.attachedFiles.map((item) => (
                      <span
                        key={item.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium border rounded-md bg-background/50"
                      >
                        {item.type === "file" && (
                          <FileText className="h-3 w-3" />
                        )}
                        {item.type === "folder" && (
                          <Folder className="h-3 w-3" />
                        )}
                        {item.type === "group" && (
                          <ListChecks className="h-3 w-3" />
                        )}
                        {item.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="markdown-content w-full min-w-0 max-w-full overflow-x-auto">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                >
                  {message.content || ""}
                </ReactMarkdown>
              </div>
            </div>
          ) : message.role === "assistant" && message.tool_calls ? (
            <div className="space-y-2 w-full min-w-0 max-w-full">
              {message.tool_calls.map(renderToolCall)}
            </div>
          ) : (
            <div className="flex flex-col w-full min-w-0 max-w-full">
              {message.role === "assistant" && message.thoughts && (
                <div className="mb-3 rounded-md border border-border/50 bg-muted/20 overflow-hidden">
                  <button
                    className="flex w-full items-center justify-between p-2 text-xs font-semibold text-muted-foreground hover:bg-muted/50 transition-colors"
                    onClick={() => setShowThoughts(!showThoughts)}
                  >
                    <div className="flex items-center gap-2">
                      <Brain className="h-4 w-4" />
                      <span className="uppercase tracking-wider">{t("aiPanel.thinking")}</span>
                    </div>
                    {showThoughts ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {showThoughts && (
                    <div className="p-3 pt-0 text-sm text-muted-foreground border-t border-border/50 markdown-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.thoughts}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              )}
              <div className="markdown-content w-full min-w-0 max-w-full overflow-x-auto">
                {message.role === "assistant" ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                  >
                    {message.content || ""}
                  </ReactMarkdown>
                ) : null}
              </div>
            </div>
          )}
        </div>
        {message.role === "assistant" &&
          !isAiPanelLoading &&
          isLastAssistantMessageInTurn && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 mt-1"
              onClick={() => onRegenerate(index)}
              title={t("aiPanel.regenerate")}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
      </div>
    </div>
  );
}

export function LoadingIndicator() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-start gap-2 text-muted-foreground italic text-sm">
      <Loader2 className="h-4 w-4 animate-spin" />
      <p>{t("aiPanel.responding")}</p>
    </div>
  );
}
