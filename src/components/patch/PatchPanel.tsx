import { useEffect, useRef } from "react";
import { useAppStore, useAppActions } from "@/store/appStore";
import { useShallow } from "zustand/react/shallow";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Code, CheckCircle2, XCircle } from "lucide-react";
import { PatchHeader } from "./PatchHeader";
import Ansi from "ansi-to-react";
import { cn } from "@/lib/utils";

export function PatchPanel() {
  const { startPatchServer, stopPatchServer, clearPatchLogs } = useAppActions();
  const { isPatchServerRunning, patchLogs, patchTaskStatus } = useAppStore(
    useShallow((state) => ({
      isPatchServerRunning: state.isPatchServerRunning,
      patchLogs: state.patchLogs,
      patchTaskStatus: state.patchTaskStatus,
    }))
  );

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const element = scrollRef.current;
      setTimeout(() => {
        element.scrollTop = element.scrollHeight;
      }, 50);
    }
  }, [patchLogs]);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <PatchHeader 
        isPatchServerRunning={isPatchServerRunning}
        onStart={startPatchServer}
        onStop={stopPatchServer}
        onClearLogs={clearPatchLogs}
        status={isPatchServerRunning ? patchTaskStatus : 'error'}
      />
      
      <ScrollArea className="flex-1 min-h-0 bg-[#0c0c0e]" viewportRef={scrollRef}>
        <div className="p-4 space-y-2 w-full min-w-0 font-mono text-[13px] leading-relaxed text-gray-300">
          {patchLogs.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/50 space-y-3">
               <Code className="h-8 w-8 opacity-50" />
               <span className="text-sm">Hãy đổi Port trong Chrome Extension sang 9998 và gọi Kilo để xem ma thuật!</span>
             </div>
          ) : (
            patchLogs.map((log, i) => {
              let lineClass = "";
              if (log.includes("✅")) lineClass = "text-emerald-400";
              if (log.includes("❌") || log.includes("LỖI") || log.includes("⚠️")) lineClass = "text-rose-400";
              if (log.includes("[SYSTEM]")) lineClass = "text-blue-400 font-bold";
              if (log.includes("===")) lineClass = "text-purple-400 font-bold mt-2";

              return (
                <div key={i} className={cn("break-words", lineClass)}>
                  <Ansi>{log}</Ansi>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}