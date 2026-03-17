import { Button } from "@/components/ui/button";
import { Play, Square, Trash2, Wrench, Loader2, CheckCircle2, XCircle, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

interface PatchHeaderProps {
  isPatchServerRunning: boolean;
  onStart: () => void;
  onStop: () => void;
  onClearLogs: () => void;
  status: 'idle' | 'running' | 'success' | 'error';
}

export function PatchHeader({ isPatchServerRunning, onStart, onStop, onClearLogs, status }: PatchHeaderProps) {
  return (
    <header className="flex items-center justify-between p-3 border-b shrink-0 bg-card">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-orange-500" />
          <h2 className="text-sm font-bold uppercase tracking-wider hidden md:block">Auto-Patch Dashboard</h2>
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
            {status === 'running' ? 'Đang áp dụng...' : 
             status === 'success' ? 'Hoàn thành' : 
             status === 'error' ? 'Lỗi' : 'Đang chờ Extension (Port 9998)'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isPatchServerRunning ? (
          <Button variant="destructive" size="sm" onClick={onStop} className="h-8">
            <Square className="h-3.5 w-3.5 mr-1.5" /> Dừng
          </Button>
        ) : (
          <Button variant="default" size="sm" onClick={onStart} className="h-8">
            <Play className="h-3.5 w-3.5 mr-1.5" /> Bật Server
          </Button>
        )}
        <Button variant="outline" size="icon" onClick={onClearLogs} className="h-8 w-8 shrink-0">
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>
    </header>
  );
}