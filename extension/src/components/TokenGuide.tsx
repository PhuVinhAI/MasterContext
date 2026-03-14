import { ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';

export function TokenGuide() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card className="border-primary/50">
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>Cách lấy Google Drive Token</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 w-8 p-0"
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </CardTitle>
        <CardDescription>
          Token cần thiết để tải dữ liệu từ Google Drive
        </CardDescription>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                1
              </div>
              <div className="flex-1">
                <p className="text-sm">
                  Mở{' '}
                  <a
                    href="https://aistudio.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Google AI Studio
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                2
              </div>
              <div className="flex-1">
                <p className="text-sm">Mở DevTools bằng phím F12</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                3
              </div>
              <div className="flex-1">
                <p className="text-sm">Chuyển sang tab Network trong DevTools</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                4
              </div>
              <div className="flex-1">
                <p className="text-sm">Tải lại trang (Ctrl+R hoặc F5)</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                5
              </div>
              <div className="flex-1">
                <p className="text-sm">
                  Tìm request có chứa <code className="px-1 py-0.5 bg-muted rounded text-xs">Authorization</code> trong Headers
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                6
              </div>
              <div className="flex-1">
                <p className="text-sm">
                  Copy giá trị Bearer token (bỏ chữ "Bearer " ở đầu, chỉ lấy phần token)
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                7
              </div>
              <div className="flex-1">
                <p className="text-sm">Dán token vào ô input bên trên và nhấn Lưu</p>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t">
            <p className="text-xs text-muted-foreground">
              Token thường có dạng: ya29.a0AfB_byC...
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
