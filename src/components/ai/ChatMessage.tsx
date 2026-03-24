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
  AlertTriangle,
  RotateCcw,
  Brain,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  FileEdit,
  Terminal,
  Pencil,
  Search,
  Files,
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

    const isPending = tool.status === "pending";

    switch (tool.function.name) {
      case "get_project_file_tree":
        toolContent = (
          <p className="font-medium text-foreground">
            {isPending ? "Đang liệt kê cấu trúc dự án" : "Đã liệt kê cấu trúc dự án"}
          </p>
        );
        break;

      case "read_file":
        ToolIcon = FileText;
        try {
          const args = JSON.parse(tool.function.arguments);
          const filesToRead: any[] = args.files_to_read || (args.file_path ? [args] : []);
          
          if (filesToRead.length === 1) {
            const f = filesToRead[0];
            const fileName = f.file_path?.split("/").pop() || "unknown";
            toolContent = (
              <div className="w-full">
                <p className="font-medium text-foreground">
                  {isPending ? "Đang đọc file:" : "Đã đọc file:"} <code className="ml-1 text-xs text-muted-foreground">{fileName}</code>
                </p>
              </div>
            );
          } else {
            toolContent = (
              <div className="w-full">
                <p className="font-medium text-foreground">
                  {isPending ? "Đang đọc file" : "Đã đọc file"} ({filesToRead.length})
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

                        const detail = tool.detailed_results?.[idx];
                        return (
                          <div
                            key={`read-${idx}`}
                            className="text-blue-600 dark:text-blue-400 whitespace-pre-wrap flex items-baseline gap-1.5"
                          >
                            <span className="select-none text-muted-foreground">
                              {detail?.status === 'error' ? <XCircle className="h-3 w-3 text-destructive inline" /> : <CheckCircle2 className="h-3 w-3 text-green-500 inline" />}
                            </span>
                            <span title={f.file_path} className={cn(detail?.status === 'error' && "text-destructive line-through")}>{fileName}</span>
                            {lineInfo && <span className="text-muted-foreground text-[10px]">{lineInfo}</span>}
                          </div>
                        );
                      })}
                    </code>
                  </pre>
                )}
              </div>
            );
          }
        } catch (e) {
          toolContent = <p>{isPending ? "Đang đọc file..." : "Đã đọc file"}</p>;
        }
        break;

      case "get_current_context_group_files":
        toolContent = (
          <p className="font-medium text-foreground">
            {isPending ? "Đang liệt kê tệp trong nhóm" : "Đã liệt kê tệp trong nhóm"}
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
                {isPending ? "Đang sửa đổi nhóm ngữ cảnh" : "Đã sửa đổi nhóm ngữ cảnh"}
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
              {isPending ? "Đang sửa đổi nhóm ngữ cảnh" : "Đã sửa đổi nhóm ngữ cảnh"}
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
                {success ? "Đã thêm vùng loại trừ cho" : "Không thể thêm vùng loại trừ cho"}
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
          toolContent = <p>Không thể thêm vùng loại trừ</p>;
        }
        break;

      case "get_dummy_project_context":
        ToolIcon = Brain;
        toolContent = (
          <p className="font-medium text-foreground">
            {isPending ? "Đang phân tích cấu trúc mã nguồn (Dummy)..." : "Đã phân tích cấu trúc mã nguồn (Dummy)"}
          </p>
        );
        break;

      case "create_context_group":
        ToolIcon = Folder;
        try {
          const args = JSON.parse(tool.function.arguments);
          toolContent = (
            <p className="font-medium text-foreground">
              {isPending ? "Đang tạo nhóm ngữ cảnh:" : "Đã tạo nhóm ngữ cảnh:"} <code className="ml-1 px-1.5 py-0.5 bg-background rounded-md text-xs">{args.name}</code>
            </p>
          );
        } catch (e) {
          toolContent = <p className="font-medium text-foreground">{isPending ? "Đang tạo nhóm ngữ cảnh..." : "Đã tạo nhóm ngữ cảnh"}</p>;
        }
        break;

      case "bash":
        ToolIcon = Terminal;
        try {
          const args = JSON.parse(tool.function.arguments);
          toolContent = (
            <div className="w-full flex flex-col gap-1.5">
              <p className="font-medium text-foreground flex items-center gap-2">
                {isPending ? "Đang chạy Terminal:" : "Đã chạy Terminal:"} <code className="text-xs text-muted-foreground truncate max-w-[300px]">{args.command}</code>
              </p>
              {tool.result && (
                <details className="group/details mt-1">
                  <summary className="text-[10px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer select-none list-none flex items-center gap-1 w-fit">
                    <ChevronRight className="h-3 w-3 transition-transform group-open/details:rotate-90" />
                    Xem chi tiết Output
                  </summary>
                  <pre className="mt-1.5 bg-muted/50 border border-border/50 p-2 rounded-md text-[11px] font-mono max-h-60 overflow-auto custom-scrollbar whitespace-pre-wrap text-foreground/80">
                    {tool.result}
                  </pre>
                </details>
              )}
            </div>
          );
        } catch (e) {
          toolContent = <p className="font-medium text-foreground">{isPending ? 'Đang chạy Terminal...' : 'Đã chạy Terminal'}</p>;
        }
        break;

      case "read":
        ToolIcon = FileText;
        try {
          const args = JSON.parse(tool.function.arguments);
          const filePath = args.file_path ?? "unknown";
          toolContent = (
            <p className="font-medium text-foreground">
              {isPending ? "Đang đọc file:" : "Đã đọc file:"} <code className="ml-1 text-xs text-muted-foreground">{filePath}</code>
            </p>
          );
        } catch (e) {
          toolContent = <p className="font-medium text-foreground">{isPending ? "Đang đọc file..." : "Đã đọc file"}</p>;
        }
        break;

      case "write":
        ToolIcon = FileEdit;
        try {
          const args = JSON.parse(tool.function.arguments);
          toolContent = (
            <p className="font-medium text-foreground">
              {isPending ? "Đang ghi đè file:" : "Đã ghi đè file:"} <code className="ml-1 text-xs text-muted-foreground">{args.file_path}</code>
            </p>
          );
        } catch (e) {
          toolContent = <p className="font-medium text-foreground">{isPending ? "Đang ghi đè file..." : "Đã ghi đè file"}</p>;
        }
        break;

      case "edit":
        ToolIcon = Pencil;
        try {
          const args = JSON.parse(tool.function.arguments);
          toolContent = (
            <p className="font-medium text-foreground">
              {isPending ? "Đang chỉnh sửa file:" : "Đã chỉnh sửa file:"} <code className="ml-1 text-xs text-muted-foreground">{args.file_path}</code>
            </p>
          );
        } catch (e) {
          toolContent = <p className="font-medium text-foreground">{isPending ? "Đang chỉnh sửa file..." : "Đã chỉnh sửa file"}</p>;
        }
        break;

      case "glob":
        ToolIcon = Files;
        try {
          const args = JSON.parse(tool.function.arguments);
          toolContent = (
            <p className="font-medium text-foreground">
              {isPending ? "Đang tìm kiếm file:" : "Đã tìm kiếm file:"} <code className="ml-1 text-xs text-muted-foreground">{args.pattern}</code>
            </p>
          );
        } catch (e) {
          toolContent = <p className="font-medium text-foreground">{isPending ? "Đang tìm kiếm file..." : "Đã tìm kiếm file"}</p>;
        }
        break;

      case "grep":
        ToolIcon = Search;
        try {
          const args = JSON.parse(tool.function.arguments);
          toolContent = (
            <p className="font-medium text-foreground">
              {isPending ? "Đang tìm kiếm nội dung:" : "Đã tìm kiếm nội dung:"} <code className="ml-1 text-xs text-muted-foreground truncate max-w-[200px] inline-block align-bottom">{args.pattern}</code>
            </p>
          );
        } catch (e) {
          toolContent = <p className="font-medium text-foreground">{isPending ? "Đang tìm kiếm nội dung..." : "Đã tìm kiếm nội dung"}</p>;
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
          ) : tool.status === "partial" ? (
            <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
          ) : tool.status === "pending" ? (
            <Loader2 className="h-5 w-5 animate-spin text-blue-500 shrink-0 mt-0.5" />
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
