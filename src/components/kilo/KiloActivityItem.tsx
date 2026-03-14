import { useState } from "react";
import { CheckCircle2, XCircle, Wrench, Terminal, Loader2, ChevronDown, ChevronUp, Activity, SearchCode } from "lucide-react";
import Ansi from "ansi-to-react";
import { cn } from "@/lib/utils";
import { type KiloActivity } from "./types";
import { stripAnsi } from "./utils";

export function KiloActivityItem({ activity }: { activity: KiloActivity }) {
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
          <div className="font-mono text-[12px] leading-relaxed whitespace-pre min-w-max">
            {activity.details.map((line, i) => {
              const cleanLine = stripAnsi(line);
              let lineClass = "text-gray-300 hover:bg-white/5 px-1 rounded-sm transition-colors";
              
              // Xử lý Highlight các cảnh báo và Lỗi (Diagnostics) từ Kilo
              if (cleanLine.startsWith('ERROR [')) {
                lineClass = "text-red-400 bg-red-950/40 px-2 py-0.5 rounded-sm border-l-2 border-red-500 font-medium my-0.5";
              } else if (cleanLine.includes('LSP errors detected')) {
                lineClass = "text-yellow-400 font-bold px-1 mt-2 mb-1";
              } else if (cleanLine.startsWith('<diagnostics') || cleanLine.startsWith('</diagnostics')) {
                lineClass = "text-blue-400/50 italic px-1 text-[10px]";
              } else if (cleanLine.startsWith('Wrote file successfully')) {
                lineClass = "text-emerald-400 font-medium px-1 mb-1";
              }

              return (
                <div key={i} className={lineClass}><Ansi>{line}</Ansi></div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
