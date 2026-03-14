import { Button } from "@/components/ui/button";
import { Play, Square, Trash2, Terminal, Loader2, Download } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useShallow } from "zustand/react/shallow";
import { useAppStore, useAppActions } from "@/store/appStore";

interface KiloHeaderProps {
  isKiloServerRunning: boolean;
  onStart: () => void;
  onStop: () => void;
  onClearLogs: () => void;
}

export function KiloHeader({ isKiloServerRunning, onStart, onStop, onClearLogs }: KiloHeaderProps) {
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
      <div className="flex items-center gap-2">
        <Terminal className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-bold uppercase tracking-wider hidden sm:block">Kilo Agent Dashboard</h2>
      </div>
      <div className="flex items-center gap-2">
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
