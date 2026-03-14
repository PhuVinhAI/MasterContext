import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Trash2, FileText, Image as ImageIcon, Brain, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { useEditorStore } from '@/lib/store';
import type { ChatTurn } from '@/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState } from 'react';

interface ChatTurnCardProps {
  turn: ChatTurn;
  index: number;
}

export function ChatTurnCard({ turn, index }: ChatTurnCardProps) {
  const { selectedTurns, toggleTurnSelection, removeTurn, removeAttachment, exportThinkingMap, setExportThinking } = useEditorStore();
  const isSelected = selectedTurns.has(index);
  const [showContent, setShowContent] = useState(false);
  const [showThinkingSection, setShowThinkingSection] = useState(false);
  
  const exportThinking = exportThinkingMap.get(index) ?? true;

  const hasContent = !!turn.content;
  const hasThoughts = !!turn.thoughts;
  const isModel = turn.role === 'model';

  return (
    <div className={`group border-2 p-6 mb-6 transition-all duration-300 relative ${isSelected ? 'border-foreground bg-foreground/5 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] translate-x-[-2px] translate-y-[-2px]' : 'border-border hover:border-foreground hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.5)]'}`}>
      {/* Decorative SVG Corner */}
      <svg className="absolute top-0 right-0 w-8 h-8 text-border group-hover:text-foreground transition-colors" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M32 0H0V2H30V32H32V0Z" fill="currentColor"/>
      </svg>
      
      <div className="flex items-start justify-between mb-6 border-b-2 border-border pb-4">
        <div className="flex items-center gap-4">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => toggleTurnSelection(index)}
            className="rounded-none border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background"
          />
          <span className="text-xs font-black uppercase tracking-widest">
            {turn.role} <span className="text-muted-foreground font-normal ml-2">[{String(index + 1).padStart(2, '0')}]</span>
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => removeTurn(index)}
          className="h-8 w-8"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-3">
        {/* Nếu là Model và có cả thinking + content, gộp chung */}
        {isModel && hasThoughts && hasContent ? (
          <div className="space-y-3">
            {/* Thinking Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={exportThinking}
                    onCheckedChange={(checked) => setExportThinking(index, !!checked)}
                  />
                  <Brain className="h-4 w-4" />
                  <span className="text-xs font-black uppercase tracking-widest">QUÁ TRÌNH SUY NGHĨ</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowThinkingSection(!showThinkingSection)}
                  className="h-6 w-6"
                >
                  {showThinkingSection ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>
              </div>
              {showThinkingSection && (
                <div className="prose prose-sm max-w-none dark:prose-invert pl-6 text-muted-foreground">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {turn.thoughts}
                  </ReactMarkdown>
                </div>
              )}
            </div>

            {/* Response Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  <span className="text-xs font-black uppercase tracking-widest">PHẢN HỒI</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowContent(!showContent)}
                  className="h-6 w-6"
                >
                  {showContent ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>
              </div>
              {showContent && (
                <div className="prose prose-sm max-w-none dark:prose-invert pl-6">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {turn.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Content riêng (User hoặc Model không có thinking) */}
            {hasContent && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    <span className="text-xs font-black uppercase tracking-widest">
                      {turn.role === 'user' ? 'TIN NHẮN' : 'PHẢN HỒI'}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowContent(!showContent)}
                    className="h-6 w-6"
                  >
                    {showContent ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                </div>
                {showContent && (
                  <div className="prose prose-sm max-w-none dark:prose-invert pl-6">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {turn.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            )}
            
            {/* Thinking riêng (Model có thinking nhưng không có content) */}
            {isModel && hasThoughts && !hasContent && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4" />
                    <span className="text-xs font-black uppercase tracking-widest">QUÁ TRÌNH SUY NGHĨ</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowThinkingSection(!showThinkingSection)}
                    className="h-6 w-6"
                  >
                    {showThinkingSection ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                </div>
                {showThinkingSection && (
                  <div className="prose prose-sm max-w-none dark:prose-invert pl-6 text-muted-foreground">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {turn.thoughts}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        
        {turn.attachments && turn.attachments.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Đính kèm:</p>
            <div className="flex flex-wrap gap-2">
              {turn.attachments.map((attachment: string, attIdx: number) => {
                const isImage = attachment.startsWith('drive_image_');
                const isDrive = attachment.startsWith('drive_');
                
                return (
                  <div
                    key={attIdx}
                    className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                  >
                    {isImage ? (
                      <ImageIcon className="h-4 w-4" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    <span className="truncate max-w-[200px]">
                      {isDrive ? attachment.replace('drive_doc_', '').replace('drive_image_', '').slice(0, 12) + '...' : attachment}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => removeAttachment(index, attIdx)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
