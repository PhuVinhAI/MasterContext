import { useEffect, useRef, useMemo } from "react";
import { useAppStore, useAppActions } from "@/store/appStore";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { 
  Play, Square, Trash2, Terminal, CheckCircle2, 
  XCircle, Wrench, Cpu, Info, Rocket, Bot, StopCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Ansi from "ansi-to-react";

const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\uFFFD/g, '');

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
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [kiloLogs]);

  const parsedLogs = useMemo(() => {
    const result: any[] = [];
    let currentRawGroup: { type: 'raw_group', lines: string[] } | null = null;

    for (const rawLog of kiloLogs) {
      const cleanLog = stripAnsi(rawLog).trim();
      
      if (!cleanLog) {
        if (currentRawGroup) currentRawGroup.lines.push(rawLog);
        continue;
      }

      let matched = false;

      // 1. System Events
      if (cleanLog.startsWith('[SYSTEM]') || cleanLog.startsWith('[SYSTEM_ERROR]')) {
        currentRawGroup = null;
        result.push({ 
          type: cleanLog.startsWith('[SYSTEM_ERROR]') ? 'error' : 'system', 
          text: cleanLog.replace(/^\[SYSTEM(_ERROR)?\]\s*/, '') 
        });
        matched = true;
      }
      // 2. Summary / Success
      else if (cleanLog.startsWith('[SUCCESS]') || cleanLog.startsWith('[VERIFIED]') || cleanLog.startsWith('✅')) {
        currentRawGroup = null;
        result.push({ type: 'summary', text: cleanLog.replace(/^(\[SUCCESS\]|\[VERIFIED\]|✅)\s*/, '') });
        matched = true;
      }
      // 3. AI Model Info
      else if (cleanLog.startsWith('> ')) {
        currentRawGroup = null;
        result.push({ type: 'model', text: cleanLog.substring(2) });
        matched = true;
      }
      // 4. Tools Actions
      else if (cleanLog.startsWith('→') || cleanLog.startsWith('✱') || cleanLog.match(/^[a-zA-Z]+\s+failed/)) {
        currentRawGroup = null;
        result.push({ type: 'tool', text: cleanLog });
        matched = true;
      }
      // 5. Terminal Commands
      else if (cleanLog.startsWith('$ ')) {
        currentRawGroup = null;
        result.push({ type: 'command', text: cleanLog.substring(2) });
        matched = true;
      }
      // 6. Errors
      else if (cleanLog.startsWith('[ERROR]') || cleanLog.startsWith('✗ ') || cleanLog.startsWith('❌ ') || cleanLog.startsWith('Error:')) {
        currentRawGroup = null;
        result.push({ type: 'error', text: cleanLog.replace(/^(\[ERROR\]|✗ |❌ )\s*/, '') });
        matched = true;
      }

      if (!matched) {
        if (currentRawGroup) {
          currentRawGroup.lines.push(rawLog);
        } else {
          currentRawGroup = { type: 'raw_group', lines: [rawLog] };
          result.push(currentRawGroup);
        }
      }
    }
    return result;
  }, [kiloLogs]);

  return (
    <div className="flex flex-col h-full bg-card">
      <header className="flex items-center justify-between p-3 pl-4 border-b shrink-0 gap-4">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-bold truncate">Kilo Local Server</h2>
          <Badge
            variant={isKiloServerRunning ? "default" : "secondary"}
            className={isKiloServerRunning ? "bg-green-500 hover:bg-green-600" : ""}
          >
            {isKiloServerRunning ? "Đang chạy" : "Đã dừng"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {isKiloServerRunning ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={stopKiloServer}
              title="Tắt Server"
            >
              <Square className="h-4 w-4 mr-2" />
              Dừng
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={startKiloServer}
              title="Bật Server (Port 9999)"
            >
              <Play className="h-4 w-4 mr-2" />
              Khởi động
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={clearKiloLogs}
            title="Xóa Logs"
            className="h-9 w-9"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </header>
      
      <div className="flex-1 bg-muted/20 overflow-hidden p-3 relative">
        <div 
          ref={scrollRef}
          className="h-full w-full overflow-y-auto custom-scrollbar pr-3 pb-4 space-y-2"
        >
          {parsedLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 italic space-y-3">
              <Terminal className="h-10 w-10 opacity-50" />
              <span>Chưa có tác vụ nào. Hãy bấm Khởi động để Kilo CLI bắt đầu làm việc...</span>
            </div>
          ) : (
            parsedLogs.map((item, idx) => {
              switch (item.type) {
                case 'system': {
                  let Icon = Info;
                  if (item.text.includes('running')) Icon = Rocket;
                  else if (item.text.includes('stopped')) Icon = StopCircle;
                  else if (item.text.includes('Kilo CLI')) Icon = Bot;

                  return (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg border border-blue-500/20 text-sm font-medium">
                      <Icon className="h-5 w-5 shrink-0" />
                      <span>{item.text}</span>
                    </div>
                  );
                }
                case 'summary':
                  return (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg border border-emerald-500/20 text-sm font-medium">
                      <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{item.text}</span>
                    </div>
                  );
                case 'error':
                  return (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-destructive/10 text-destructive rounded-lg border border-destructive/20 text-sm font-medium">
                      <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{item.text}</span>
                    </div>
                  );
                case 'model':
                  return (
                    <div key={idx} className="flex items-center gap-2 pt-2">
                      <Badge variant="outline" className="gap-1.5 py-1 bg-background text-muted-foreground shadow-sm">
                        <Cpu className="h-3.5 w-3.5" />
                        {item.text}
                      </Badge>
                    </div>
                  );
                case 'tool':
                  return (
                    <div key={idx} className="flex items-center gap-2 text-sm text-muted-foreground py-0.5 px-2">
                      <Wrench className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-mono text-[13px]">{item.text}</span>
                    </div>
                  );
                case 'command':
                  return (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-[#0d1117] rounded-md border border-border/50 text-[13px] font-mono text-gray-300 shadow-sm mt-2">
                      <span className="text-emerald-500 shrink-0 select-none">$</span>
                      <span className="break-all">{item.text}</span>
                    </div>
                  );
                case 'raw_group':
                  return (
                    <div key={idx} className="bg-[#0d1117] text-[#c9d1d9] p-3 rounded-md border border-border/50 overflow-x-auto shadow-inner">
                      <div className="font-mono text-[13px] leading-relaxed whitespace-pre min-w-max">
                        {item.lines.map((line: string, lIdx: number) => (
                          <div key={lIdx} className="min-h-[1.25rem] hover:bg-white/5 px-1 rounded-sm transition-colors">
                            <Ansi>{line}</Ansi>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                default: return null;
              }
            })
          )}
        </div>
      </div>
    </div>
  );
}
