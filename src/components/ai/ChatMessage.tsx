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
  FilePlus,
  FileMinus,
  FileEdit,
  Scissors,
  XCircle,
  RotateCcw,
  Brain,
  ChevronDown,
  ChevronUp,
  Terminal,
  FileDiff,
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

function TerminalToolView({ command, result, status, t }: any) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="flex flex-col w-full min-w-0">
      <div 
        className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 -ml-1 rounded transition-colors" 
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="font-medium flex-1 text-foreground">{t("aiPanel.toolCall.executingCommand")}</span>
        {isOpen ? <ChevronUp className="h-4 w-4 shrink-0"/> : <ChevronDown className="h-4 w-4 shrink-0"/>}
      </div>
      {isOpen && (
        <div className="mt-2 p-2.5 bg-black/90 dark:bg-black/60 rounded-md text-green-400 font-mono text-[11px] overflow-auto max-h-64 custom-scrollbar w-full border border-border/10">
          <div className="text-white/90 mb-2 select-all break-all font-semibold">$ {command}</div>
          {status ? (
            <div className="whitespace-pre-wrap break-all border-t border-white/20 pt-2 text-green-300/80">{result || "No output"}</div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground italic border-t border-white/20 pt-2"><Loader2 className="h-3 w-3 animate-spin"/> Running...</div>
          )}
        </div>
      )}
    </div>
  );
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
          const filePath = args.file_path || "unknown file";
          const fileName = filePath.split("/").pop();
          let lineInfo = "";
          if (args.start_line && args.end_line) {
            lineInfo = `${args.start_line}-${args.end_line}`;
          } else if (args.start_line) {
            lineInfo = `${args.start_line}-...`;
          } else if (args.end_line) {
            lineInfo = `...-${args.end_line}`;
          }

          toolContent = (
            <div className="flex items-baseline gap-1.5">
              <code className="font-medium text-foreground" title={filePath}>
                {fileName}
              </code>
              {lineInfo && (
                <span className="text-xs text-muted-foreground">
                  ({lineInfo})
                </span>
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

      case "create_file":
        ToolIcon = FilePlus;
        try {
          const args = JSON.parse(tool.function.arguments);
          const filePath = args.file_path ?? "unknown file";
          const fileName = filePath.split("/").pop() ?? filePath;
          const success = tool.status !== "error";

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
                    ? "aiPanel.toolCall.createFileSuccess"
                    : "aiPanel.toolCall.createFileError"
                )}
              </span>
              <code className="font-medium" title={filePath}>
                {fileName}
              </code>
            </div>
          );
        } catch (e) {
          toolContent = <p>{t("aiPanel.toolCall.writingFileGeneric")}</p>;
        }
        break;

      case "delete_file":
        ToolIcon = FileMinus;
        try {
          const args = JSON.parse(tool.function.arguments);
          const filePath = args.file_path ?? "unknown file";
          const fileName = filePath.split("/").pop() ?? filePath;
          const success = tool.status !== "error";

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
                    ? "aiPanel.toolCall.deleteFileSuccess"
                    : "aiPanel.toolCall.deleteFileError"
                )}
              </span>
              <code className="font-medium" title={filePath}>
                {fileName}
              </code>
            </div>
          );
        } catch (e) {
          toolContent = <p>{t("aiPanel.toolCall.writingFileGeneric")}</p>;
        }
        break;

      case "rename_file":
        ToolIcon = FileEdit;
        try {
          const args = JSON.parse(tool.function.arguments);
          const success = tool.status !== "error";
          const oldName = args.old_path?.split("/").pop() || "unknown";
          const newName = args.new_path?.split("/").pop() || "unknown";

          toolContent = (
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span
                className={cn(
                  "font-medium",
                  success ? "text-foreground" : "text-destructive"
                )}
              >
                {t(
                  success
                    ? "aiPanel.toolCall.renameFileSuccess"
                    : "aiPanel.toolCall.renameFileError"
                )}
              </span>
              <code className="font-medium text-xs" title={args.old_path}>{oldName}</code>
              <span className="text-xs">→</span>
              <code className="font-medium text-xs" title={args.new_path}>{newName}</code>
            </div>
          );
        } catch (e) {
          toolContent = <p>{t("aiPanel.toolCall.writingFileGeneric")}</p>;
        }
        break;

      case "create_directory":
        ToolIcon = Folder;
        try {
          const args = JSON.parse(tool.function.arguments);
          const success = tool.status !== "error";
          const dirName = args.dir_path?.split("/").pop() || "unknown";

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
                    ? "aiPanel.toolCall.createDirSuccess"
                    : "aiPanel.toolCall.createDirError"
                )}
              </span>
              <code className="font-medium" title={args.dir_path}>
                {dirName}/
              </code>
            </div>
          );
        } catch (e) {
          toolContent = <p>{t("aiPanel.toolCall.writingFileGeneric")}</p>;
        }
        break;

      case "apply_search_replace":
        ToolIcon = FileDiff;
        try {
          const args = JSON.parse(tool.function.arguments);
          const filePath = args.file_path ?? "unknown file";
          const fileName = filePath.split("/").pop() ?? filePath;
          const success = tool.status !== "error";

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
                    ? "aiPanel.toolCall.searchReplaceSuccess"
                    : "aiPanel.toolCall.searchReplaceError"
                )}
              </span>
              <code className="font-medium" title={filePath}>
                {fileName}
              </code>
            </div>
          );
        } catch (e) {
          toolContent = <p>{t("aiPanel.toolCall.writingFileGeneric")}</p>;
        }
        break;

      case "execute_terminal_command":
        ToolIcon = Terminal;
        try {
          const args = JSON.parse(tool.function.arguments);
          toolContent = <TerminalToolView command={args.command} result={tool.result} status={tool.status} t={t} />;
        } catch (e) {
          toolContent = <p>{t("aiPanel.toolCall.writingFileGeneric")}</p>;
        }
        break;

      case "write_file":
        ToolIcon = FileEdit;
        try {
          const args = JSON.parse(tool.function.arguments);
          const filePath = args.file_path ?? "unknown file";
          const fileName = filePath.split("/").pop() ?? filePath;
          const success = tool.status !== "error";

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
                    ? "aiPanel.toolCall.writeFileSuccess"
                    : "aiPanel.toolCall.writeFileError"
                )}
              </span>
              <code className="font-medium" title={filePath}>
                {fileName}
              </code>
            </div>
          );
        } catch (e) {
          toolContent = <p>{t("aiPanel.toolCall.writingFileGeneric")}</p>;
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

      default:
        toolContent = <p>{tool.function.name}</p>;
        break;
    }

    return (
      <div
        key={tool.id}
        className="flex items-start gap-2.5 text-sm bg-muted/60 dark:bg-muted/30 rounded-lg p-3 border"
      >
        <div className="flex items-center gap-1.5">
          {tool.status === "error" ? (
            <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
          )}
          {ToolIcon && (
            <ToolIcon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          )}
        </div>
        {toolContent}
      </div>
    );
  };

  return (
    <div
      className={cn(
        "group flex w-full items-start gap-2",
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
            "max-w-xs md:max-w-md lg:max-w-lg text-sm rounded-lg",
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
            <div className="flex flex-col gap-2">
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
              <div className="markdown-content">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                >
                  {message.content || ""}
                </ReactMarkdown>
              </div>
            </div>
          ) : message.role === "assistant" && message.tool_calls ? (
            <div className="space-y-2">
              {message.tool_calls.map(renderToolCall)}
            </div>
          ) : (
            <div className="flex flex-col w-full">
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
              <div className="markdown-content">
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
