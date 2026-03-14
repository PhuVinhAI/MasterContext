import { Button } from "@/components/ui/button";
import { Play, Square, Trash2, Terminal, Loader2, Download, CheckCircle2, XCircle, Activity, Puzzle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useShallow } from "zustand/react/shallow";
import { useAppStore, useAppActions } from "@/store/appStore";
import { cn } from "@/lib/utils";
import { openUrl } from "@tauri-apps/plugin-opener";

interface KiloHeaderProps {
  isKiloServerRunning: boolean;
  onStart: () => void;
  onStop: () => void;
  onClearLogs: () => void;
  status: 'idle' | 'running' | 'success' | 'error';
}

export function KiloHeader({ isKiloServerRunning, onStart, onStop, onClearLogs, status }: KiloHeaderProps) {
  const { isKiloInstalled, selectedKiloModel, kiloAvailableModels } = useAppStore(
    useShallow(state => ({
      isKiloInstalled: state.isKiloInstalled,
      selectedKiloModel: state.selectedKiloModel,
      kiloAvailableModels: state.kiloAvailableModels,
    }))
  );
  const { installKiloCli, setSelectedKiloModel } = useAppActions();

  return (
    <header className="flex items-center justify-between p-3 border-b shrink-0 bg-card">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-wider hidden md:block">Kilo Agent Dashboard</h2>
        </div>
        
        <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/30 rounded-md border text-[11px] font-medium">
          {status === 'running' && <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />}
          {status === 'success' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
          {status === 'error' && <XCircle className="h-3.5 w-3.5 text-destructive" />}
          {status === 'idle' && <Activity className="h-3.5 w-3.5 text-muted-foreground" />}
          <span className={cn(
            status === 'running' ? "text-blue-500" :
            status === 'success' ? "text-emerald-500" :
            status === 'error' ? "text-destructive" :
            "text-muted-foreground"
          )}>
            {status === 'running' ? 'Đang xử lý...' : 
             status === 'success' ? 'Hoàn thành' : 
             status === 'error' ? 'Lỗi / Dừng' : 'Đang chờ lệnh'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => openUrl("https://github.com/PhuVinhAI/aiggstudioHistory/releases")} className="h-8">
          <Puzzle className="h-3.5 w-3.5 mr-1.5 text-orange-500" /> Cài Extension
        </Button>
        {isKiloInstalled === null ? (
          <Button variant="outline" size="sm" disabled className="h-8">
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Kiểm tra...
          </Button>
        ) : isKiloInstalled === false ? (
          <Button variant="default" size="sm" onClick={installKiloCli} className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white">
            <Download className="h-3.5 w-3.5 mr-1.5" /> Cài Kilo CLI
          </Button>
        ) : (
          <>
            {kiloAvailableModels.length > 0 && (
              <Select value={selectedKiloModel} onValueChange={setSelectedKiloModel}>
                <SelectTrigger className="h-8 w-[150px] md:w-[250px] text-xs font-mono">
                  <SelectValue placeholder="Chọn AI Model..." />
                </SelectTrigger>
                <SelectContent>
                  {kiloAvailableModels.map(m => (
                    <SelectItem key={m.id} value={m.id} className="text-xs font-mono">
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {isKiloServerRunning ? (
              <Button variant="destructive" size="sm" onClick={onStop} className="h-8">
                <Square className="h-3.5 w-3.5 mr-1.5" /> Dừng
              </Button>
            ) : (
              <Button variant="default" size="sm" onClick={onStart} className="h-8">
                <Play className="h-3.5 w-3.5 mr-1.5" /> Bật Server
              </Button>
            )}
          </>
        )}
        <Button variant="outline" size="icon" onClick={onClearLogs} className="h-8 w-8 shrink-0">
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>
    </header>
  );
}
