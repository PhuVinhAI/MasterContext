import { extractPromptIdFromUrl, convertPromptDataToChatTurns } from '../utils/api';

async function showNotification(title: string, message: string, type: 'info' | 'error' | 'success' = 'info', tabId?: number) {
  // 1. Broadcast Toast cho DOM (dành cho người dùng đang xem trực tiếp tab AI Studio)
  const payload = { action: 'SHOW_NOTIFICATION', title, message, type };
  if (tabId) {
    chrome.tabs.sendMessage(tabId, payload).catch(() => {});
  } else {
    chrome.tabs.query({ url: "https://aistudio.google.com/*" }, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id) chrome.tabs.sendMessage(tab.id, payload).catch(() => {});
      });
    });
  }

  // 2. KÍCH HOẠT NHẤP NHÁY TASKBAR (drawAttention)
  // Gọi API native của HĐH để làm chớp sáng icon trình duyệt dưới thanh Taskbar/Dock
  if (tabId) {
    chrome.tabs.get(tabId, (tab) => {
      if (tab.windowId) {
        chrome.windows.update(tab.windowId, { drawAttention: true }).catch(() => {});
      }
    });
  } else {
    chrome.tabs.query({ url: "https://aistudio.google.com/*" }, (tabs) => {
      const windowIds = new Set(tabs.map(t => t.windowId));
      windowIds.forEach(winId => {
        if (winId) chrome.windows.update(winId, { drawAttention: true }).catch(() => {});
      });
    });
  }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'executeKiloWorkflow') {
    executeKiloWorkflow(request.url, sender.tab?.id, false).catch(console.error);
    return true;
  }

  if (request.action === 'executeManualKilo') {
    executeKiloWorkflow(request.url, request.tabId, true).catch(console.error);
    return true;
  }

  if (request.action === 'fetchPromptData') {
    fetchPromptDataFromDrive(request.promptId, request.token)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'downloadDriveFile') {
    downloadDriveFile(request.fileId, request.token)
      .then(result => sendResponse({ success: true, data: result.data, mimeType: result.mimeType }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

async function fetchPromptDataFromDrive(promptId: string, token?: string) {
  if (!token) {
    throw new Error('Drive API token is required. Please add your token in the popup.');
  }

  try {
    const url = `https://www.googleapis.com/drive/v3/files/${promptId}?alt=media`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Drive API error: 401 - Token không hợp lệ hoặc đã hết hạn');
      }
      throw new Error(`Drive API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch from Drive API:', error);
    throw error;
  }
}

async function downloadDriveFile(fileId: string, token?: string): Promise<{ data: string; mimeType: string }> {
  if (!token) {
    throw new Error('Drive API token is required');
  }

  let mimeType = 'application/octet-stream';

  try {
    // Get file metadata first to know the MIME type
    const metaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType`;
    const metaResponse = await fetch(metaUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (metaResponse.ok) {
      const meta = await metaResponse.json();
      mimeType = meta.mimeType || mimeType;
    }
  } catch (error) {
    console.error('Failed to get file metadata:', error);
  }

  // Download file content
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }

  // Try to get MIME type from response headers if not already set
  const contentType = response.headers.get('content-type');
  if (contentType && mimeType === 'application/octet-stream') {
    mimeType = contentType.split(';')[0].trim();
  }

  // Check if it's a text file
  const isText = mimeType.startsWith('text/') || 
                 mimeType.includes('javascript') ||
                 mimeType.includes('json') ||
                 mimeType.includes('xml');

  if (isText) {
    // For text files, get as text directly and return without base64 encoding
    const text = await response.text();
    return { data: text, mimeType };
  } else {
    // For binary files (images, PDFs)
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    
    return { data: btoa(binary), mimeType };
  }
}

console.log('AI Studio Chat Archiver: Background service worker started');

async function executeKiloWorkflow(url: string, tabId?: number, isManual: boolean = false) {
  const prefix = isManual ? 'Kilo Thủ Công' : 'Auto-Kilo';
  const promptId = extractPromptIdFromUrl(url);
  
  if (!promptId) {
    console.error(`${prefix}: Không tìm thấy promptId trên URL`);
    if (isManual) showNotification(`Lỗi ${prefix}`, 'Vui lòng mở trang AI Studio chat trước.', 'error', tabId);
    return;
  }

  const result = await chrome.storage.local.get(['driveToken']) as { driveToken?: string };
  const driveToken = result.driveToken;
  if (!driveToken) {
    showNotification(`Lỗi ${prefix}`, 'Chưa cấu hình Drive Token. Hãy mở Popup extension.', 'error', tabId);
    return;
  }

  try {
    const promptData = await fetchPromptDataFromDrive(promptId, driveToken);
    if (!promptData) {
      showNotification(`Lỗi ${prefix}`, 'Không thể tải dữ liệu lịch sử chat từ Google Drive.', 'error', tabId);
      return;
    }

    const chatTurns = convertPromptDataToChatTurns(promptData);
    if (chatTurns.length === 0) return;

    const lastTurn = chatTurns[chatTurns.length - 1];
    
    // Đảm bảo là lượt của AI
    if (lastTurn.role !== 'model') return;
    
    let prompt = lastTurn.content;
    if (!prompt) return;

    const diffRegex = /<<<START OF DIFF>>>([\s\S]*?)<<<END OF DIFF>>>/g;
    const matches = [...prompt.matchAll(diffRegex)];
    if (matches.length > 0) {
      prompt = matches.map(m => m[1].trim()).join('\n\n');
    } else {
      showNotification(`${prefix} Bỏ Qua`, 'AI đã trả lời nhưng không có mã nguồn nào cần cập nhật.', 'info', tabId);
      return;
    }

    // Thông báo bắt đầu chạy
    showNotification(`${prefix} Đang Chạy`, 'Đang gửi mã nguồn xuống cho Kilo CLI xử lý...', 'info', tabId);

    // Đợi Kilo process kết thúc (Local server trả về HTTP 200 hoặc HTTP 500)
    const response = await fetch('http://localhost:9999/api/kilo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      showNotification(`${prefix} Hoàn Thành`, 'Kilo CLI đã xử lý và áp dụng mã nguồn xong!', 'success', tabId);
    } else {
      const errorMsg = data.error || 'Kilo CLI gặp lỗi khi thực thi. Hãy kiểm tra terminal.';
      showNotification(`${prefix} Thất Bại`, errorMsg, 'error', tabId);
    }
  } catch (error) {
    console.error(`Lỗi khi execute Kilo (${prefix}):`, error);
    showNotification(`${prefix} Lỗi Kết Nối`, 'Không thể kết nối máy chủ Kilo Local (Cổng 9999). Bạn đã chạy "ai-kilo-server" chưa?', 'error', tabId);
  }
}
