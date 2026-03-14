import { Button } from "@/components/ui/button";
import { Play, Square, Trash2, Terminal, TerminalSquare } from "lucide-react";

interface KiloHeaderProps {
  isKiloServerRunning: boolean;
  onStart: () => void;
  onStop: () => void;
  onClearLogs: () => void;
  onOpenTerminal: () => void;
}

export function KiloHeader({ isKiloServerRunning, onStart, onStop, onClearLogs, onOpenTerminal }: KiloHeaderProps) {
  return (
    <header className="flex items-center justify-between p-3 border-b shrink-0 bg-card">
      <div className="flex items-center gap-2">
        <Terminal className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-bold uppercase tracking-wider">Kilo Agent Dashboard</h2>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onOpenTerminal} className="h-8" title="Mở CMD tại thư mục dự án">
          <TerminalSquare className="h-3.5 w-3.5 mr-1.5" /> CMD
        </Button>
        {isKiloServerRunning ? (
          <Button variant="destructive" size="sm" onClick={onStop} className="h-8">
            <Square className="h-3.5 w-3.5 mr-1.5" /> Dừng
          </Button>
        ) : (
          <Button variant="default" size="sm" onClick={onStart} className="h-8">
            <Play className="h-3.5 w-3.5 mr-1.5" /> Khởi động (9999)
          </Button>
        )}
        <Button variant="outline" size="icon" onClick={onClearLogs} className="h-8 w-8">
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>
    </header>
  );
}
