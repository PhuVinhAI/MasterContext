import { useEffect, useRef, useMemo } from "react";
import { useAppStore, useAppActions } from "@/store/appStore";
import { useShallow } from "zustand/react/shallow";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Rocket, Code } from "lucide-react";
import { KiloHeader } from "./kilo/KiloHeader";
import { KiloStatusCards } from "./kilo/KiloStatusCards";
import { KiloActivityItem } from "./kilo/KiloActivityItem";
import { type KiloActivity } from "./kilo/types";
import { stripAnsi } from "./kilo/utils";

export function KiloPanel() {
  const { startKiloServer, stopKiloServer, clearKiloLogs, openKiloTerminal } = useAppActions();
  const { isKiloServerRunning, kiloLogs } = useAppStore(
    useShallow((state) => ({
      isKiloServerRunning: state.isKiloServerRunning,
      kiloLogs: state.kiloLogs,
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
  }, [kiloLogs]);

  const parsedState = useMemo((): { status: 'idle' | 'running' | 'success' | 'error'; model: string | null; activities: KiloActivity[] } => {
    let status: 'idle' | 'running' | 'success' | 'error' = isKiloServerRunning ? 'idle' : 'error';
    let currentModel: string | null = null;
    const activities: KiloActivity[] = [];
    
    const state: { current: KiloActivity | null } = { current: null };
    let idCounter = 0;

    const pushActivity = (act: Omit<KiloActivity, 'id'>) => {
      const ref = state.current;
      if (ref && ref.status === 'pending' && act.type !== 'error') {
        ref.status = 'success';
      }
      const newActivity: KiloActivity = { ...act, id: idCounter++ };
      activities.push(newActivity);
      state.current = newActivity;
    };

    if (!isKiloServerRunning) {
      status = 'error';
    }

    for (const rawLog of kiloLogs) {
      const cleanLog = stripAnsi(rawLog).trim();
      if (!cleanLog) {
         const ref = state.current;
         if (ref) ref.details.push(rawLog);
         continue;
      }

      if (cleanLog.startsWith('[SYSTEM] Bắt đầu') || cleanLog.includes('Bắt đầu chạy Kilo CLI')) {
         status = 'running';
         pushActivity({ type: 'info', title: 'Khởi chạy Kilo Agent', details: [rawLog], status: 'success' });
      }
      else if (cleanLog.startsWith('> ')) {
         currentModel = cleanLog.substring(2);
      }
      else if (cleanLog.startsWith('→') || cleanLog.startsWith('✱') || cleanLog.startsWith('←')) {
         pushActivity({ type: 'tool', title: cleanLog.replace(/^[→✱←]\s*/, ''), details: [rawLog], status: 'pending' });
      }
      else if (cleanLog.startsWith('$ ')) {
         pushActivity({ type: 'command', title: cleanLog, details: [rawLog], status: 'pending' });
      }
      else if (cleanLog.startsWith('[SUCCESS]') || cleanLog.startsWith('✅') || cleanLog.includes('hoàn thành nhiệm vụ')) {
         status = 'success';
         pushActivity({ type: 'success', title: cleanLog.replace(/^(\[SUCCESS\]|✅)\s*/, ''), details: [rawLog], status: 'success' });
      }
      else if (cleanLog.startsWith('[ERROR]') || cleanLog.startsWith('✗') || cleanLog.startsWith('Error:')) {
         status = 'error';
         const ref = state.current;
         if (ref && ref.status === 'pending') {
            ref.status = 'error';
            ref.details.push(rawLog);
         } else {
            pushActivity({ type: 'error', title: cleanLog.replace(/^(\[ERROR\]|✗)\s*/, ''), details: [rawLog], status: 'error' });
         }
      }
      else if (cleanLog.startsWith('[SYSTEM]')) {
         pushActivity({ type: 'info', title: cleanLog.replace(/^\[SYSTEM\]\s*/, ''), details: [rawLog], status: 'success' });
      }
       else {
          const ref = state.current;
          if (ref) {
             ref.details.push(rawLog);
             // Ngăn chặn việc báo success sai khi đang bị lỗi
             if (ref.status !== 'error' && (cleanLog.includes('built in') || cleanLog.includes('success'))) {
               ref.status = 'success';
             }
          } else {
             pushActivity({ type: 'info', title: 'System Output', details: [rawLog], status: 'success' });
          }
       }
    }

    const lastRef = state.current;
    if (lastRef && lastRef.status === 'pending' && (status === 'success' || status === 'error')) {
      lastRef.status = status;
    }

    return { status, model: currentModel, activities };
  }, [kiloLogs, isKiloServerRunning]);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <KiloHeader 
        isKiloServerRunning={isKiloServerRunning}
        onStart={startKiloServer}
        onStop={stopKiloServer}
        onClearLogs={clearKiloLogs}
        onOpenTerminal={openKiloTerminal}
      />
      
      <ScrollArea className="flex-1 min-h-0" viewportRef={scrollRef}>
        <div className="p-4 space-y-6">
          <KiloStatusCards status={parsedState.status} model={parsedState.model} />

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
              <Code className="h-4 w-4" /> Luồng thực thi
            </h3>
            
            {parsedState.activities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/50 space-y-3 border-2 border-dashed rounded-xl">
                <Rocket className="h-8 w-8 opacity-50" />
                <span className="text-sm">Hệ thống đang chờ yêu cầu từ Kilo CLI...</span>
              </div>
            ) : (
              <div className="space-y-3 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                {parsedState.activities.map((act) => (
                  <div key={act.id} className="relative z-10">
                    <KiloActivityItem activity={act} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
