import { useState, useEffect, useRef } from "react";
import { useAppStore, useAppActions } from "@/store/appStore";
import { useShallow } from "zustand/react/shallow";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Code, CheckCircle2, XCircle, FileEdit, FilePlus, FileMinus, FolderPlus, Replace, TerminalSquare, ChevronDown, ChevronUp } from "lucide-react";
import { PatchHeader } from "./PatchHeader";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PatchPanel() {
  const { startPatchServer, stopPatchServer, clearPatchLogs } = useAppActions();
  const { isPatchServerRunning, patchOperations, patchTaskStatus } = useAppStore(
    useShallow((state) => ({
      isPatchServerRunning: state.isPatchServerRunning,
      patchOperations: state.patchOperations,
      patchTaskStatus: state.patchTaskStatus,
    }))
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedOps, setExpandedOps] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedOps(prev => ({ ...prev, [id]: !prev[id] }));
  };

  useEffect(() => {
    if (scrollRef.current) {
      const element = scrollRef.current;
      setTimeout(() => {
        element.scrollTop = element.scrollHeight;
      }, 50);
    }
  }, [patchOperations]);

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

  const successCount = patchOperations.filter(o => o.status === 'success').length;
  const errorCount = patchOperations.filter(o => o.status === 'error').length;

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
          
          {patchOperations.length > 0 && (
            <div className="flex items-center gap-2 mb-4 text-xs font-semibold">
              <Badge variant="outline" className="bg-muted">Tổng cộng: {patchOperations.length}</Badge>
              {successCount > 0 && <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Thành công: {successCount}</Badge>}
              {errorCount > 0 && <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">Lỗi: {errorCount}</Badge>}
            </div>
          )}

          {patchOperations.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/50 space-y-3 border-2 border-dashed rounded-xl">
               <Code className="h-8 w-8 opacity-50" />
               <span className="text-sm text-center px-4">Hãy chọn Target Engine là "Auto-Patch" trong Extension và gọi AI để xem cập nhật UI tại đây!</span>
             </div>
          ) : (
            <div className="grid gap-2">
              {patchOperations.map((op, i) => {
                const isExpanded = expandedOps[`${op.id}-${i}`];
                const isCommand = op.opType === 'command';
                const hasLongOutput = op.message.includes('\n') || op.message.length > 100;
                
                return (
                  <Card key={`${op.id}-${i}`} className="p-3 flex flex-col gap-2 bg-card shadow-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 font-mono text-sm">
                        {renderOpIcon(op.opType, op.status)}
                        <span className="truncate flex-1 font-semibold">{op.file}</span>
                      </div>
                      {op.status === 'success' ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : op.status === 'error' ? (
                        <XCircle className="h-4 w-4 text-destructive shrink-0" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
                      )}
                    </div>
                    
                    {isCommand || hasLongOutput ? (
                      <div className="px-6 pb-1">
                        <div 
                          className="text-[11px] font-semibold text-muted-foreground/80 hover:text-foreground cursor-pointer flex items-center gap-1 mb-1 transition-colors select-none"
                          onClick={() => toggleExpand(`${op.id}-${i}`)}
                        >
                          {isExpanded ? <ChevronUp className="h-3 w-3"/> : <ChevronDown className="h-3 w-3"/>}
                          {isExpanded ? "Ẩn chi tiết output" : "Hiển thị chi tiết output"}
                        </div>
                        {isExpanded && (
                          <pre className="text-[11px] bg-muted/40 border border-border/50 p-2 rounded-md overflow-x-auto whitespace-pre-wrap max-h-80 font-mono text-muted-foreground custom-scrollbar">
                            {op.message}
                          </pre>
                        )}
                      </div>
                    ) : (
                      <div className={cn(
                        "text-xs px-6",
                        op.status === 'error' ? "text-destructive font-medium" : "text-muted-foreground"
                      )}>
                        {op.message}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}