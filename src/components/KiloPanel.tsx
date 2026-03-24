import { useEffect, useRef, useMemo } from "react";
import { useAppStore, useAppActions } from "@/store/appStore";
import { useShallow } from "zustand/react/shallow";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Rocket, Code } from "lucide-react";
import { KiloHeader } from "./kilo/KiloHeader";
import { KiloActivityItem } from "./kilo/KiloActivityItem";
import { type KiloActivity } from "./kilo/types";
import { stripAnsi } from "./kilo/utils";

export function KiloPanel() {
  const { startKiloServer, stopKiloServer, clearKiloLogs, checkKiloInstalled, fetchKiloModels } = useAppActions();
  const { isKiloServerRunning, kiloLogs, kiloTaskStatus } = useAppStore(
    useShallow((state) => ({
      isKiloServerRunning: state.isKiloServerRunning,
      kiloLogs: state.kiloLogs,
      kiloTaskStatus: state.kiloTaskStatus,
    }))
  );

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkKiloInstalled().then(() => {
      fetchKiloModels();
    });
  }, [checkKiloInstalled, fetchKiloModels]);

  useEffect(() => {
    if (scrollRef.current) {
      const element = scrollRef.current;
      setTimeout(() => {
        element.scrollTop = element.scrollHeight;
      }, 50);
    }
  }, [kiloLogs]);

  const parsedState = useMemo((): { status: 'idle' | 'running' | 'success' | 'error'; model: string | null; activities: KiloActivity[] } => {
    const finalStatus = isKiloServerRunning ? kiloTaskStatus : 'error';
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

    for (const rawLog of kiloLogs) {
      const cleanLog = stripAnsi(rawLog).trim();
      if (!cleanLog) {
         const ref = state.current;
         if (ref) ref.details.push(rawLog);
         continue;
      }

      if (cleanLog.startsWith('[SYSTEM] Bắt đầu') || cleanLog.includes('Bắt đầu chạy Kilo CLI')) {
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
       else if (cleanLog.startsWith('[SUCCESS]') || cleanLog.startsWith('✅') || cleanLog.includes('hoàn thành nhiệm vụ') || cleanLog.includes('[TASK_COMPLETED]') || cleanLog.includes('<<<TASK_COMPLETED>>>')) {
          pushActivity({ type: 'success', title: cleanLog.replace(/^(\[SUCCESS\]|✅)\s*/, '').replace('[TASK_COMPLETED]', 'Task Completed').replace('<<<TASK_COMPLETED>>>', 'Task Completed'), details: [rawLog], status: 'success' });
       }
      else if (cleanLog.startsWith('[ERROR]') || cleanLog.startsWith('✗') || cleanLog.startsWith('Error:')) {
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
             if (ref.status !== 'error' && (cleanLog.includes('built in') || cleanLog.includes('success'))) {
               ref.status = 'success';
             }
          } else {
             pushActivity({ type: 'info', title: 'System Output', details: [rawLog], status: 'success' });
          }
       }
    }

    const lastRef = state.current;
    if (lastRef && lastRef.status === 'pending' && (finalStatus === 'success' || finalStatus === 'error')) {
      lastRef.status = finalStatus;
    }

    return { status: finalStatus, model: currentModel, activities };
  }, [kiloLogs, isKiloServerRunning, kiloTaskStatus]);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <KiloHeader
        isKiloServerRunning={isKiloServerRunning}
        onStart={startKiloServer}
        onStop={stopKiloServer}
        onClearLogs={clearKiloLogs}
        status={parsedState.status}
      />

      <ScrollArea className="flex-1 min-h-0" viewportRef={scrollRef}>
        <div className="p-4 space-y-6 w-full min-w-0 max-w-full">
          <div className="w-full min-w-0 max-w-full">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
              <Code className="h-4 w-4 shrink-0" /> <span className="truncate">Luồng thực thi</span>
            </h3>

            {parsedState.activities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/50 space-y-3 border-2 border-dashed rounded-xl w-full min-w-0 max-w-full">
                <Rocket className="h-8 w-8 opacity-50 shrink-0" />
                <span className="text-sm text-center px-4 truncate w-full">Hệ thống đang chờ yêu cầu từ Kilo CLI...</span>
              </div>
            ) : (
              <div className="space-y-3 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent w-full min-w-0 max-w-full">
                {parsedState.activities.map((act) => (
                  <div key={act.id} className="relative z-10 w-full min-w-0 max-w-full">
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
