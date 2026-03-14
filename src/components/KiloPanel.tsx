import { useEffect, useRef } from "react";
import { useAppStore, useAppActions } from "@/store/appStore";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Play, Square, Trash2, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

  return (
    <div className="flex flex-col h-full bg-card">
      <header className="flex items-center justify-between p-4 border-b shrink-0 gap-4">
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
      
      <div className="flex-1 bg-[#0d1117] text-[#c9d1d9] overflow-hidden p-2">
        <div 
          ref={scrollRef}
          className="h-full w-full overflow-y-auto custom-scrollbar font-mono text-xs whitespace-pre-wrap break-all px-2"
        >
          {kiloLogs.length === 0 ? (
            <span className="text-muted-foreground italic">Không có log nào. Hãy bấm Khởi động để bắt đầu lắng nghe Kilo CLI...</span>
          ) : (
            kiloLogs.map((log: string, i: number) => (
              <div key={i} className="mb-1 leading-relaxed">
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
