// Auto-Watch Kilo Logic
let isGenerating = false;
let autoWatchEnabled = false;

// Content script chạy trong ISOLATED world - có thể dùng chrome.storage
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  if (event.data.type === 'DRIVE_TOKEN_DETECTED') {
    const token = event.data.token;
    
    chrome.storage.local.get(['driveToken'], (result) => {
      const currentToken = result.driveToken as string | undefined;
      
      if (currentToken !== token) {
        chrome.storage.local.set({ driveToken: token });
      }
    });
  }

  // Bắt tín hiệu Network từ interceptor.ts
  if (event.data.type === 'AI_STATE_CHANGED') {
    if (!autoWatchEnabled) return;

    if (event.data.state === 'generating') {
      if (!isGenerating) {
        isGenerating = true;
        console.log('🔄 [Auto-watch Debug] Network Event: Đã bắt được GenerateContent. AI đang trả lời...');
      }
    } else if (event.data.state === 'updated') {
      if (isGenerating) {
        isGenerating = false;
        console.log('✅ [Auto-watch Debug] Network Event: Đã bắt được Update/CreatePrompt. Dữ liệu đã lưu lên Drive.');
        
        // Gọi thẳng sau 1 giây mà không cần đợi 6 giây như trước (do đã update xong)
        setTimeout(() => {
          console.log('🚀 [Auto-watch Debug] Bắn tín hiệu executeKiloWorkflow tới Background!');
          chrome.runtime.sendMessage({ 
            action: 'executeKiloWorkflow', 
            url: window.location.href 
          });
        }, 1000);
      }
    }
  }
});

// Khởi tạo trạng thái ban đầu
chrome.storage.local.get(['autoWatchKilo'], (res) => {
  autoWatchEnabled = !!res.autoWatchKilo;
  console.log(`⚙️ [Auto-watch Debug] Trạng thái khởi tạo: ${autoWatchEnabled ? 'BẬT' : 'TẮT'}`);
});

// Lắng nghe nếu người dùng bật/tắt trong Popup
chrome.storage.onChanged.addListener((changes) => {
  if (changes.autoWatchKilo) {
    autoWatchEnabled = !!changes.autoWatchKilo.newValue;
    console.log(`⚙️ [Auto-watch Debug] Đã thay đổi trạng thái: ${autoWatchEnabled ? 'BẬT' : 'TẮT'}`);
  }
});

// Lắng nghe yêu cầu hiển thị Toast Notifications từ Background
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'SHOW_NOTIFICATION') {
    showToast(request.title, request.message, request.type);
  }
});

function showToast(title: string, message: string, type: 'info' | 'error' | 'success' = 'info') {
  const toast = document.createElement('div');
  // Styling chuẩn Neo-Brutalism (Awwwards): Viền đen cứng, bóng đổ khối đặc, typography lớn
  toast.style.position = 'fixed';
  toast.style.bottom = '32px';
  toast.style.right = '32px';
  toast.style.padding = '20px';
  toast.style.backgroundColor = type === 'error' ? '#FF4444' : type === 'success' ? '#00FF66' : '#FFFF00';
  toast.style.color = '#000000'; // Luôn dùng text đen để tương phản mạnh
  toast.style.border = '4px solid #000000';
  toast.style.borderRadius = '0px'; // Không bo góc
  toast.style.boxShadow = '8px 8px 0px 0px rgba(0,0,0,1)'; // Bóng cứng
  toast.style.zIndex = '99999999';
  toast.style.fontFamily = '"Helvetica Neue", Arial, sans-serif';
  toast.style.minWidth = '350px';
  toast.style.maxWidth = '450px';
  toast.style.transition = 'all 0.3s ease-out';
  toast.style.transform = 'translateY(50px) translateX(50px)';
  toast.style.opacity = '0';
  
  // Decorative SVG Header inside toast
  const iconSvg = type === 'success' 
    ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`
    : type === 'error'
    ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
    : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="3"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

  const headerWrapper = document.createElement('div');
  headerWrapper.style.display = 'flex';
  headerWrapper.style.alignItems = 'center';
  headerWrapper.style.gap = '12px';
  headerWrapper.style.marginBottom = '8px';
  headerWrapper.style.borderBottom = '2px solid #000';
  headerWrapper.style.paddingBottom = '8px';

  headerWrapper.innerHTML = `
    ${iconSvg}
    <div style="font-weight: 900; font-size: 18px; text-transform: uppercase; letter-spacing: 1px;">${title}</div>
  `;

  const msgEl = document.createElement('div');
  msgEl.style.fontSize = '14px';
  msgEl.style.fontWeight = '600';
  msgEl.style.lineHeight = '1.4';
  msgEl.textContent = message;

  toast.appendChild(headerWrapper);
  toast.appendChild(msgEl);
  document.body.appendChild(toast);

  // Trigger reflow
  void toast.offsetWidth;

  // Animate in
  toast.style.transform = 'translateY(0) scale(1)';
  toast.style.opacity = '1';

  // Remove after 5 seconds
  setTimeout(() => {
    toast.style.transform = 'translateY(20px) scale(0.95)';
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 5000);
}

console.log('🚀 [AI Studio Archiver] Content script initialized with Network Observer.');
