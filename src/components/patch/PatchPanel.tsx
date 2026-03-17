import { useState, useEffect, useRef } from "react";
import { useAppStore, useAppActions } from "@/store/appStore";
import { useShallow } from "zustand/react/shallow";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Code, CheckCircle2, XCircle, FileEdit, FilePlus, FileMinus, FolderPlus, Replace, TerminalSquare, ChevronDown, ChevronUp, Copy, Check, Clock } from "lucide-react";
import { PatchHeader } from "./PatchHeader";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { type PatchTaskUI } from "@/store/types";

const renderOpIcon = (opType: string, status: string) => {
  const className = status === 'error' ? "text-destructive" : "text-primary";
  switch (opType) {
    case 'modify': return <FileEdit className={cn("h-4 w-4", className)} />;
    case 'create': return <FilePlus className={cn("h-4 w-4 text-emerald-500")} />;
    case 'delete': return <FileMinus className={cn("h-4 w-4 text-rose-500")} />;
    case 'rename': return <Replace className={cn("h-4 w-4 text-purple-500")} />;
    case 'mkdir': return <FolderPlus className={cn("h-4 w-4 text-emerald-500")} />;
    case 'command': return <TerminalSquare className={cn("h-4 w-4 text-orange-500")} />;
    default: return <Code className="h-4 w-4" />;
  }
};

const TaskGroup = ({ task, isFirst }: { task: PatchTaskUI, isFirst: boolean }) => {
  const [isExpanded, setIsExpanded] = useState(isFirst);
  const [expandedOps, setExpandedOps] = useState<Record<string, boolean>>({});
  const [isCopied, setIsCopied] = useState(false);

  // Force expand if task is running
  useEffect(() => {
    if (task.status === 'running') setIsExpanded(true);
  }, [task.status]);

  const toggleExpandOp = (id: string) => {
    setExpandedOps(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyErrors = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const errorOps = task.operations.filter(op => op.status === 'error');
    let text = "--- AUTO-PATCH ERRORS ---\n\n";
    errorOps.forEach(op => {
      text += `File/Cmd: ${op.file}\nAction: ${op.opType}\nError:\n${op.message}\n\n`;
    });
    await writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const successCount = task.operations.filter(o => o.status === 'success').length;
  const errorCount = task.operations.filter(o => o.status === 'error').length;
  const hasError = task.status === 'error' || errorCount > 0;

  const date = new Date(task.timestamp);
  const timeStr = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <Card className={cn("overflow-hidden border shadow-xs transition-colors", hasError ? "border-destructive/30" : "border-border")}>
      <div 
        className={cn(
          "flex items-center justify-between p-3 cursor-pointer select-none transition-colors",
          hasError ? "bg-destructive/5 hover:bg-destructive/10" : "bg-muted/30 hover:bg-muted/50"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          {task.status === 'running' ? (
            <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
          ) : hasError ? (
            <XCircle className="h-4 w-4 text-destructive shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          )}
          <span className="text-sm font-semibold flex items-center gap-1.5">
            Task <Clock className="h-3 w-3 text-muted-foreground ml-1" /> <span className="text-xs text-muted-foreground font-mono">{timeStr}</span>
          </span>
          
          <div className="hidden sm:flex items-center gap-2 ml-2 text-xs">
            {successCount > 0 && <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 h-5">Thành công: {successCount}</Badge>}
            {errorCount > 0 && <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 h-5">Lỗi: {errorCount}</Badge>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {hasError && (
            <Button 
              variant="outline" 
              size="sm" 
              className="h-7 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={handleCopyErrors}
            >
              {isCopied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
              {isCopied ? "Đã copy" : "Copy Lỗi"}
            </Button>
          )}
          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {isExpanded && task.operations.length > 0 && (
        <div className="p-3 grid gap-2 border-t bg-background">
          {task.operations.map((op, i) => {
            const isOpExpanded = expandedOps[`${op.id}-${i}`];
            const isCommand = op.opType === 'command';
            const hasLongOutput = op.message.includes('\n') || op.message.length > 100;
            
            return (
              <div key={`${op.id}-${i}`} className="flex flex-col gap-1.5 p-2 rounded-md border bg-muted/10">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 font-mono text-sm">
                    {renderOpIcon(op.opType, op.status)}
                    <span className="truncate flex-1 font-semibold">{op.file}</span>
                  </div>
                  {op.status === 'success' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : op.status === 'error' ? (
                    <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  ) : (
                    <div className="h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
                  )}
                </div>
                
                {isCommand || hasLongOutput ? (
                  <div className="pl-6">
                    <div 
                      className="text-[10px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1 mb-1 transition-colors select-none w-fit"
                      onClick={() => toggleExpandOp(`${op.id}-${i}`)}
                    >
                      {isOpExpanded ? <ChevronUp className="h-3 w-3"/> : <ChevronDown className="h-3 w-3"/>}
                      {isOpExpanded ? "Ẩn chi tiết" : "Hiển thị chi tiết"}
                    </div>
                    {isOpExpanded && (
                      <pre className="text-[11px] bg-muted/50 border border-border/50 p-2 rounded-md overflow-x-auto whitespace-pre-wrap max-h-60 font-mono text-foreground/80 custom-scrollbar">
                        {op.message}
                      </pre>
                    )}
                  </div>
                ) : (
                  <div className={cn(
                    "text-xs pl-6",
                    op.status === 'error' ? "text-destructive font-medium" : "text-muted-foreground"
                  )}>
                    {op.message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {isExpanded && task.operations.length === 0 && (
        <div className="p-4 text-center text-xs text-muted-foreground border-t bg-background">
          Đang khởi tạo các tác vụ...
        </div>
      )}
    </Card>
  );
};

export function PatchPanel() {
  const { startPatchServer, stopPatchServer, clearPatchLogs } = useAppActions();
  const { isPatchServerRunning, patchTasks, patchTaskStatus } = useAppStore(
    useShallow((state) => ({
      isPatchServerRunning: state.isPatchServerRunning,
      patchTasks: state.patchTasks,
      patchTaskStatus: state.patchTaskStatus,
    }))
  );

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when a new task starts or operations update if we are already near bottom
  useEffect(() => {
    if (scrollRef.current) {
      const element = scrollRef.current;
      // Only auto scroll if near bottom to not annoy user reading history
      const isNearBottom = element.scrollHeight - element.clientHeight <= element.scrollTop + 100;
      if (isNearBottom || patchTasks.length <= 1) {
        setTimeout(() => {
          element.scrollTop = element.scrollHeight;
        }, 50);
      }
    }
  }, [patchTasks]);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <PatchHeader 
        isPatchServerRunning={isPatchServerRunning}
        onStart={startPatchServer}
        onStop={stopPatchServer}
        onClearLogs={clearPatchLogs}
        status={isPatchServerRunning ? patchTaskStatus : 'error'}
      />
      
      <ScrollArea className="flex-1 min-h-0" viewportRef={scrollRef}>
        <div className="p-4 space-y-4 w-full min-w-0">
          {patchTasks.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/50 space-y-3 border-2 border-dashed rounded-xl">
               <Code className="h-8 w-8 opacity-50" />
               <span className="text-sm text-center px-4">Hãy chọn Target Engine là "Auto-Patch" trong Extension và gọi AI để xem cập nhật UI tại đây!</span>
             </div>
          ) : (
            <div className="flex flex-col gap-4 pb-4">
              {patchTasks.map((task, index) => (
                <TaskGroup key={task.id} task={task} isFirst={index === patchTasks.length - 1} />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}