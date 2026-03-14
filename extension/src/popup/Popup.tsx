import { useState, useEffect } from 'react';
import { ExternalLink, CheckCircle2, Cpu } from 'lucide-react';
import { extractPromptIdFromUrl } from '../utils/api';
import { TokenGuide } from '../components/TokenGuide';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export default function Popup() {
  const [driveToken, setDriveToken] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const [saved, setSaved] = useState(false);
  const [autoWatch, setAutoWatch] = useState(false);

  useEffect(() => {
    loadData();
    getCurrentTabUrl();
    
    // Lắng nghe thay đổi token từ storage
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.driveToken) {
        const newToken = changes.driveToken.newValue as string | undefined;
        setDriveToken(newToken || '');
      }
    };
    
    chrome.storage.onChanged.addListener(handleStorageChange);
    
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const loadData = async () => {
    const result = await chrome.storage.local.get(['driveToken', 'autoWatchKilo']);
    setDriveToken((result.driveToken as string) || '');
    setAutoWatch(!!result.autoWatchKilo);
  };

  const getCurrentTabUrl = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    setCurrentUrl(tab.url || '');
  };

  const handleSaveToken = async () => {
    await chrome.storage.local.set({ driveToken });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleCallKilo = async () => {
    const promptId = extractPromptIdFromUrl(currentUrl);
    if (!promptId) {
      alert('Vui lòng mở trang AI Studio chat trước');
      return;
    }

    if (!driveToken) {
      alert('Vui lòng nhập Drive API Token trước');
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.runtime.sendMessage({ 
        action: 'executeManualKilo', 
        url: currentUrl,
        tabId: tab.id
      });
      window.close();
    }
  };

  const handleOpenEditor = async () => {
    const promptId = extractPromptIdFromUrl(currentUrl);
    if (!promptId) {
      alert('Vui lòng mở trang AI Studio chat trước');
      return;
    }

    const editorUrl = chrome.runtime.getURL(`src/editor/index.html?promptId=${promptId}`);
    await chrome.tabs.create({ url: editorUrl });
  };

  const isAIStudioPage = currentUrl.includes('aistudio.google.com');

  return (
    <div className="w-[380px] max-h-[600px] flex flex-col bg-background antialiased tracking-tight">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-black uppercase tracking-tighter">LƯU TRỮ CHAT</h1>
          <div className={`px-2 py-0.5 text-[10px] font-bold uppercase border ${isAIStudioPage ? 'border-foreground bg-foreground text-background' : 'border-destructive text-destructive'}`}>
            {isAIStudioPage ? 'SẴN SÀNG' : 'KHÔNG HỖ TRỢ'}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground uppercase font-bold tracking-widest">BẢNG ĐIỀU KHIỂN AI STUDIO</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Token Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-xs font-bold uppercase tracking-widest">MÃ DRIVE TOKEN</span>
            <button 
              onClick={() => setShowTokenInput(!showTokenInput)}
              className="text-[10px] underline underline-offset-4 font-bold uppercase hover:text-muted-foreground transition-colors tracking-widest"
            >
              {driveToken ? 'ĐÃ LƯU' : 'TRỐNG'}
            </button>
          </div>

          {showTokenInput && (
            <div className="space-y-3 pt-3">
              <div className="space-y-2">
                <Label htmlFor="token" className="text-[10px] uppercase font-bold tracking-widest">TOKEN</Label>
                <Input
                  id="token"
                  type="password"
                  value={driveToken}
                  onChange={(e) => setDriveToken(e.target.value)}
                  placeholder="Nhập mã Drive API token..."
                  className="text-sm font-mono"
                />
              </div>
              
              <Button 
                onClick={handleSaveToken}
                className="w-full bg-foreground text-background font-black uppercase text-xs tracking-widest"
                size="sm"
              >
                {saved ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 mr-2" />
                    ĐÃ LƯU THÀNH CÔNG
                  </>
                ) : (
                  'LƯU TOKEN VÀO BỘ NHỚ'
                )}
              </Button>

              <TokenGuide />
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* Call Kilo Button */}
          <button
            onClick={handleCallKilo}
            disabled={!isAIStudioPage}
            className="w-full bg-foreground text-background py-4 px-4 font-black uppercase text-sm flex items-center justify-between hover:bg-muted-foreground transition-all disabled:opacity-20 group tracking-widest"
          >
            <span>CHẠY TIẾN TRÌNH KILO</span>
            <Cpu className="h-4 w-4 group-hover:scale-110 transition-transform" />
          </button>

          {/* Open Editor Button */}
          <button
            onClick={handleOpenEditor}
            disabled={!isAIStudioPage}
            className="w-full border-2 border-foreground py-4 px-4 font-black uppercase text-sm flex items-center justify-between hover:bg-muted transition-all disabled:opacity-20 tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]"
          >
            <span>MỞ TRÌNH CHỈNH SỬA CHAT</span>
            <ExternalLink className="h-4 w-4" />
          </button>
          
          {/* Auto Watch Kilo Feature */}
          <div className="pt-4 border-t-2 border-border mt-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest">THEO DÕI TỰ ĐỘNG (KILO)</span>
              <Switch
                checked={autoWatch}
                onCheckedChange={async (checked) => {
                  setAutoWatch(checked);
                  await chrome.storage.local.set({ autoWatchKilo: checked });
                }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed font-bold tracking-wider">
              HỆ THỐNG ĐANG THEO DÕI NGẦM. KILO SẼ TỰ ĐỘNG BẮT MÃ NGUỒN (DIFF) VÀ CẬP NHẬT NGAY KHI AI TRẢ LỜI XONG MÀ KHÔNG CẦN BẠN BẤM NÚT.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t bg-muted/50 p-3 text-center">
        <p className="text-xs text-muted-foreground">
          Mở AI Studio chat và nhấn "Mở Editor"
        </p>
      </div>
    </div>
  );
}
