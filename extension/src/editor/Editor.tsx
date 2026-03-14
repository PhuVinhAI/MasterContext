import { useLoadChatData } from '@/hooks/useLoadChatData';
import { useEditorStore } from '@/lib/store';
import { Toolbar } from './components/Toolbar';
import { ChatTurnCard } from './components/ChatTurnCard';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TokenGuide } from '@/components/TokenGuide';
import type { ChatTurn } from '@/types';

export default function Editor() {
  const { isLoading, error } = useLoadChatData();
  const { chatTurns } = useEditorStore();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-sm text-muted-foreground">Đang tải dữ liệu chat...</p>
        </div>
      </div>
    );
  }

  if (error) {
    const is401Error = error.includes('401') || error.includes('unauthorized');
    const isTokenMissing = error.includes('token is required');
    
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <div className="max-w-2xl w-full space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <CardTitle>
                  {is401Error || isTokenMissing ? 'Cần xác thực Google Drive' : 'Lỗi tải dữ liệu'}
                </CardTitle>
              </div>
              <CardDescription>
                {is401Error || isTokenMissing 
                  ? 'Token truy cập Google Drive chưa có hoặc đã hết hạn'
                  : error
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => {
                  chrome.runtime.openOptionsPage?.() || 
                  window.open(chrome.runtime.getURL('popup/index.html'), '_blank');
                }}
                className="w-full"
              >
                Mở popup để nhập token
              </Button>
            </CardContent>
          </Card>

          {(is401Error || isTokenMissing) && <TokenGuide />}
          
          {!is401Error && !isTokenMissing && (
            <Button 
              onClick={() => window.location.reload()}
              variant="outline"
              className="w-full"
            >
              Thử lại
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background font-sans selection:bg-foreground selection:text-background">
      <Toolbar />
      
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-[1000px] py-20 px-6">
          <header className="mb-20 border-b-4 border-foreground pb-8 flex items-end justify-between relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-4">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-foreground animate-spin-slow">
                  <path d="M20 0V40M0 20H40" stroke="currentColor" strokeWidth="4"/>
                  <circle cx="20" cy="20" r="12" stroke="currentColor" strokeWidth="4"/>
                </svg>
                <div className="h-2 w-20 bg-foreground"></div>
              </div>
              <h1 className="text-7xl font-black uppercase tracking-tighter leading-[0.8] mb-2">
                DỮ LIỆU<br/>LÕI
              </h1>
              <p className="text-sm font-bold uppercase text-foreground bg-foreground/10 inline-block px-3 py-1 mt-4 tracking-widest border border-foreground">
                GIAO DIỆN KIỂM CHỨNG & TINH CHỈNH LOGIC // V.2
              </p>
            </div>
            <div className="text-right flex flex-col items-end z-10">
              <svg width="60" height="20" viewBox="0 0 60 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="mb-4">
                <rect width="8" height="20" fill="currentColor"/>
                <rect x="12" width="4" height="20" fill="currentColor"/>
                <rect x="20" width="12" height="20" fill="currentColor"/>
                <rect x="36" width="4" height="20" fill="currentColor"/>
                <rect x="44" width="16" height="20" fill="currentColor"/>
              </svg>
              <div className="text-[10px] font-black uppercase tracking-widest border-b border-foreground pb-1 mb-1">PHIÊN HOẠT ĐỘNG</div>
              <div className="text-xl font-black uppercase tracking-tighter">SYS_CACHE_0x1</div>
            </div>
            
            {/* Background decorative typography */}
            <div className="absolute right-0 top-0 opacity-5 pointer-events-none select-none">
              <span className="text-[150px] font-black leading-none tracking-tighter">GỐC</span>
            </div>
          </header>

          {chatTurns.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Không có dữ liệu chat</p>
            </div>
          ) : (
            <div className="space-y-4">
              {chatTurns.map((turn: ChatTurn, index: number) => (
                <ChatTurnCard key={index} turn={turn} index={index} />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
