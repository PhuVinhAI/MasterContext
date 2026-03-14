import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Download, RotateCcw, Loader2 } from 'lucide-react';
import { useEditorStore } from '@/lib/store';
import { exportChat } from '@/utils/export';
import { toast } from 'sonner';
import { useState } from 'react';
import type { ChatTurn } from '@/types';

export function Toolbar() {
  const {
    chatTurns,
    selectedTurns,
    showThinking,
    exportThinkingMap,
    includeImages,
    includePDFs,
    driveToken,
    selectAllTurns,
    deselectAllTurns,
    restoreOriginalData,
    setShowThinking,
    setIncludeImages,
    setIncludePDFs,
  } = useEditorStore();
  
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const turnsToExport = chatTurns.filter((_: ChatTurn, index: number) => selectedTurns.has(index));
      
      if (turnsToExport.length === 0) {
        toast.error('Vui lòng chọn ít nhất một turn để export');
        return;
      }

      // Tạo map mới với index tương ứng của turnsToExport
      const exportMap = new Map<number, boolean>();
      turnsToExport.forEach((turn: ChatTurn, newIndex: number) => {
        const originalIndex = chatTurns.indexOf(turn);
        const shouldExport = exportThinkingMap.get(originalIndex) ?? true;
        exportMap.set(newIndex, shouldExport);
      });

      await exportChat(
        turnsToExport,
        { includeImages, includePDFs },
        driveToken || undefined,
        exportMap
      );
      
      toast.success('Export thành công!');
    } catch (error) {
      toast.error('Export thất bại: ' + (error as Error).message);
    } finally {
      setIsExporting(false);
    }
  };
  
  const handleRestore = () => {
    restoreOriginalData();
    toast.success('Đã khôi phục dữ liệu gốc!');
  };

  const allSelected = selectedTurns.size === chatTurns.length;

  return (
    <div className="sticky top-0 z-50 border-b border-border bg-background antialiased tracking-tight">
      <div className="mx-auto max-w-[1400px] px-6 flex h-16 items-center justify-between">
        <div className="flex items-center gap-8">
          <h2 className="text-sm font-black uppercase tracking-tighter">TRÌNH CHỈNH SỬA .V1</h2>
          
          <div className="h-4 w-px bg-border" />

          <div className="flex items-center gap-6">
            <button
              onClick={allSelected ? deselectAllTurns : selectAllTurns}
              disabled={isExporting}
              className="text-[11px] font-bold uppercase hover:text-muted-foreground transition-colors disabled:opacity-30"
            >
              {allSelected ? 'BỎ CHỌN TẤT CẢ' : 'CHỌN TẤT CẢ'}
            </button>
          
            <Button
              variant="outline"
              size="sm"
              onClick={handleRestore}
              disabled={isExporting}
              className="uppercase font-bold text-xs"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              KHÔI PHỤC GỐC
            </Button>
            
            <div className="flex items-center gap-2">
              <Switch
                id="show-thinking"
                checked={showThinking}
                onCheckedChange={setShowThinking}
              />
              <Label htmlFor="show-thinking" className="text-xs font-bold uppercase">
                XUẤT SUY LUẬN
              </Label>
            </div>
            
            <div className="flex items-center gap-2">
              <Switch
                id="include-images"
                checked={includeImages}
                onCheckedChange={setIncludeImages}
              />
              <Label htmlFor="include-images" className="text-xs font-bold uppercase">
                TẢI ẢNH
              </Label>
            </div>
            
            <div className="flex items-center gap-2">
              <Switch
                id="include-pdfs"
                checked={includePDFs}
                onCheckedChange={setIncludePDFs}
              />
              <Label htmlFor="include-pdfs" className="text-xs font-bold uppercase">
                TẢI PDF
              </Label>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleExport} disabled={isExporting} className="uppercase font-bold text-xs">
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ĐANG XUẤT...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                XUẤT FILE ({selectedTurns.size}/{chatTurns.length})
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
