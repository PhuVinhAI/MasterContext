import { useEffect, useRef, useMemo, useState } from "react";
import { useAppStore, useAppActions } from "@/store/appStore";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Play, Square, Trash2, Terminal, CheckCircle2, 
  XCircle, Wrench, Cpu, Rocket, Loader2, ChevronDown, 
  ChevronUp, Code, Activity, SearchCode
} from "lucide-react";
import Ansi from "ansi-to-react";
import { cn } from "@/lib/utils";

const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\uFFFD/g, '');

interface KiloActivity {
  id: number;
  type: 'tool' | 'command' | 'info' | 'error' | 'success';
  title: string;
  details: string[];
  status: 'pending' | 'success' | 'error';
}

function ActivityItem({ activity }: { activity: KiloActivity }) {
  const [expanded, setExpanded] = useState(activity.status === 'error' || activity.type === 'command');
  const hasDetails = activity.details.length > 1;

  let Icon = Activity;
  let colorClass = "text-muted-foreground";
  let bgClass = "bg-muted/50";

  if (activity.status === 'error' || activity.type === 'error') {
    Icon = XCircle;
    colorClass = "text-destructive";
    bgClass = "bg-destructive/10 border-destructive/20";
  } else if (activity.status === 'success' && activity.type === 'success') {
    Icon = CheckCircle2;
    colorClass = "text-emerald-500";
    bgClass = "bg-emerald-500/10 border-emerald-500/20";
  } else if (activity.status === 'pending') {
    Icon = Loader2;
    colorClass = "text-blue-500 animate-spin";
    bgClass = "bg-blue-500/10 border-blue-500/20";
  } else if (activity.type === 'tool') {
    Icon = activity.title.includes('Read') ? SearchCode : Wrench;
    colorClass = "text-amber-500";
  } else if (activity.type === 'command') {
    Icon = Terminal;
    colorClass = "text-purple-500";
  }

  return (
    <div className={cn("border rounded-lg overflow-hidden transition-all shadow-sm", bgClass)}>
      <div 
        className={cn("p-3 flex items-center justify-between", hasDetails ? "cursor-pointer hover:bg-black/5 dark:hover:bg-white/5" : "")}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icon className={cn("h-4 w-4 shrink-0", colorClass)} />
          <span className="font-medium text-sm truncate">{activity.title}</span>
        </div>
        {hasDetails && (
          <div className="shrink-0 ml-2 text-muted-foreground">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        )}
      </div>
      {expanded && hasDetails && (
        <div className="bg-[#0d1117] p-3 border-t border-border/50 overflow-x-auto shadow-inner">
          <div className="font-mono text-[12px] leading-relaxed whitespace-pre text-gray-300 min-w-max">
            {activity.details.map((line, i) => (
              <div key={i} className="hover:bg-white/5 px-1 rounded-sm"><Ansi>{line}</Ansi></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function KiloPanel() {
  const { startKiloServer, stopKiloServer, clearKiloLogs } = useAppActions();
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
            if (cleanLog.includes('built in') || cleanLog.includes('success')) {
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
    <div className="flex flex-col h-full bg-background">
      <header className="flex items-center justify-between p-3 border-b shrink-0 bg-card">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-wider">Kilo Agent Dashboard</h2>
        </div>
        <div className="flex items-center gap-2">
          {isKiloServerRunning ? (
            <Button variant="destructive" size="sm" onClick={stopKiloServer} className="h-8">
              <Square className="h-3.5 w-3.5 mr-1.5" /> Dừng
            </Button>
          ) : (
            <Button variant="default" size="sm" onClick={startKiloServer} className="h-8">
              <Play className="h-3.5 w-3.5 mr-1.5" /> Khởi động (9999)
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={clearKiloLogs} className="h-8 w-8">
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </header>
      
      <ScrollArea className="flex-1" viewportRef={scrollRef}>
        <div className="p-4 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Card className="bg-card shadow-xs">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Trạng thái Agent</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 flex items-center gap-2">
                {parsedState.status === 'running' && <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />}
                {parsedState.status === 'success' && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                {parsedState.status === 'error' && <XCircle className="h-5 w-5 text-destructive" />}
                {parsedState.status === 'idle' && <Activity className="h-5 w-5 text-muted-foreground" />}
                <span className="font-bold text-sm">
                  {parsedState.status === 'running' ? 'Đang xử lý...' : 
                   parsedState.status === 'success' ? 'Hoàn thành' : 
                   parsedState.status === 'error' ? 'Lỗi / Dừng' : 'Đang chờ lệnh'}
                </span>
              </CardContent>
            </Card>
            
            <Card className="bg-card shadow-xs">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Mô hình AI (Model)</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {parsedState.model ? (
                  <Badge variant="secondary" className="font-mono text-xs">
                    <Cpu className="h-3.5 w-3.5 mr-1.5 text-primary" />
                    {parsedState.model}
                  </Badge>
                ) : (
                  <span className="text-sm text-muted-foreground italic">Chưa xác định</span>
                )}
              </CardContent>
            </Card>
          </div>

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
                    <ActivityItem activity={act} />
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
