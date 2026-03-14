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
    <div className={cn("border rounded-lg overflow-hidden transition-all shadow-sm flex flex-col w-full max-w-full", bgClass)}>
      <div 
        className={cn("p-3 flex items-center justify-between gap-2 w-full", hasDetails ? "cursor-pointer hover:bg-black/5 dark:hover:bg-white/5" : "")}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
          <Icon className={cn("h-4 w-4 shrink-0", colorClass)} />
          <span className="font-medium text-sm truncate block flex-1" title={activity.title}>{activity.title}</span>
        </div>
        {hasDetails && (
          <div className="shrink-0 text-muted-foreground flex items-center justify-center p-1 rounded hover:bg-black/10 dark:hover:bg-white/10">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        )}
      </div>
      {expanded && hasDetails && (
        <div className="bg-[#18181B] border-t border-border/50 overflow-auto max-h-[500px] shadow-inner custom-scrollbar w-full">
          <div className="p-4 font-mono text-[12px] leading-relaxed whitespace-pre min-w-full w-fit inline-block">
            {activity.details.map((line, i) => {
              const cleanLine = stripAnsi(line);
              let lineClass = "text-gray-300 hover:bg-white/10 px-2 py-0.5 rounded-sm transition-colors block w-full";
              
              // Highlight Logic cho Code Diff & Error
              if (cleanLine.startsWith('+') && !cleanLine.startsWith('+++')) {
                lineClass = "text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded-sm block w-full";
              } else if (cleanLine.startsWith('-') && !cleanLine.startsWith('---')) {
                lineClass = "text-rose-400 bg-rose-950/40 px-2 py-0.5 rounded-sm block w-full";
              } else if (cleanLine.startsWith('@@')) {
                lineClass = "text-cyan-400 font-medium px-2 py-1 mt-1 block w-full";
              } else if (cleanLine.startsWith('+++') || cleanLine.startsWith('---')) {
                lineClass = "text-gray-100 font-bold px-2 py-0.5 block w-full";
              } else if (cleanLine.startsWith('ERROR [') || cleanLine.toLowerCase().includes('error')) {
                lineClass = "text-rose-400 bg-rose-950/40 px-2 py-1 rounded-sm border-l-2 border-rose-500 font-medium my-1 block w-full";
              } else if (cleanLine.includes('LSP errors detected') || cleanLine.includes('Warning')) {
                lineClass = "text-amber-400 font-bold px-2 mt-2 mb-1 block w-full";
              } else if (cleanLine.startsWith('<diagnostics') || cleanLine.startsWith('</diagnostics')) {
                lineClass = "text-blue-400/60 italic px-2 text-[11px] block w-full";
              } else if (cleanLine.startsWith('Wrote file successfully')) {
                lineClass = "text-emerald-400 font-medium px-2 mb-1 block w-full";
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
