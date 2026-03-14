import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Activity, Cpu } from "lucide-react";

interface KiloStatusCardsProps {
  status: 'idle' | 'running' | 'success' | 'error';
  model: string | null;
}

export function KiloStatusCards({ status, model }: KiloStatusCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Card className="bg-card shadow-xs">
        <CardHeader>
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Trạng thái Agent</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          {status === 'running' && <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />}
          {status === 'success' && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
          {status === 'error' && <XCircle className="h-5 w-5 text-destructive" />}
          {status === 'idle' && <Activity className="h-5 w-5 text-muted-foreground" />}
          <span className="font-bold text-sm">
            {status === 'running' ? 'Đang xử lý...' : 
             status === 'success' ? 'Hoàn thành' : 
             status === 'error' ? 'Lỗi / Dừng' : 'Đang chờ lệnh'}
          </span>
        </CardContent>
      </Card>
      
      <Card className="bg-card shadow-xs">
        <CardHeader>
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Mô hình AI (Model)</CardTitle>
        </CardHeader>
        <CardContent>
          {model ? (
            <Badge variant="secondary" className="font-mono text-xs">
              <Cpu className="h-3.5 w-3.5 mr-1.5 text-primary" />
              {model}
            </Badge>
          ) : (
            <span className="text-sm text-muted-foreground italic">Chưa xác định</span>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
