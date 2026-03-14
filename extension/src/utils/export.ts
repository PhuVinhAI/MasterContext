import JSZip from 'jszip';
import type { ChatTurn, ExportConfig } from '../types';

export async function exportChat(
  chatTurns: ChatTurn[],
  config: ExportConfig,
  driveToken?: string,
  exportThinkingMap?: Map<number, boolean>
): Promise<void> {
  // Pre-download all Drive files to check MIME types
  const driveFiles = new Map<string, { data: string; mimeType: string }>();
  let hasBinaryFiles = false;
  
  for (const turn of chatTurns) {
    if (turn.attachments) {
      for (const filename of turn.attachments) {
        if (filename.startsWith('drive_doc_') || filename.startsWith('drive_image_')) {
          const driveId = filename.replace('drive_doc_', '').replace('drive_image_', '');
          if (!driveFiles.has(driveId)) {
            try {
              const fileData = await downloadFromDrive(driveId, driveToken);
              driveFiles.set(driveId, fileData);
              
              const mimeType = fileData.mimeType || 'application/octet-stream';
              const isText = mimeType.startsWith('text/') ||
                            mimeType.includes('javascript') ||
                            mimeType.includes('json') ||
                            mimeType.includes('xml');
              
              if (!isText) {
                if (filename.startsWith('drive_image_') && config.includeImages) {
                  hasBinaryFiles = true;
                } else if (filename.startsWith('drive_doc_') && config.includePDFs) {
                  hasBinaryFiles = true;
                }
              }
            } catch (error) {
              console.error(`Failed to download ${driveId}:`, error);
            }
          }
        }
      }
    }
  }

  const zip = hasBinaryFiles ? new JSZip() : null;
  
  // Create markdown content
  let markdown = `# Lịch sử chat: AI Studio\n\n`;
  markdown += `Xuất lúc: ${new Date().toLocaleString('vi-VN')}\n\n---\n\n`;

  for (let i = 0; i < chatTurns.length; i++) {
    const turn = chatTurns[i];
    markdown += `## ${turn.role === 'user' ? 'User' : 'Model'}:\n\n`;
    
    // Export thinking TRƯỚC (nếu được chọn)
    const shouldExportThinking = exportThinkingMap?.get(i) ?? true;
    if (turn.thoughts && shouldExportThinking) {
      markdown += `<details>\n<summary>Thinking Process</summary>\n\n${turn.thoughts}\n\n</details>\n\n`;
    }

    // Export response SAU
    if (turn.content) {
      markdown += `${turn.content}\n\n`;
    }

    if (turn.attachments && turn.attachments.length > 0) {
      markdown += `**Đính kèm:**\n`;
      for (const filename of turn.attachments) {
        if (filename.startsWith('drive_doc_') || filename.startsWith('drive_image_')) {
          const driveId = filename.replace('drive_doc_', '').replace('drive_image_', '');
          const fileData = driveFiles.get(driveId);
          
          if (fileData) {
            const mimeType = fileData.mimeType || 'application/octet-stream';
            const isText = mimeType.startsWith('text/') ||
                          mimeType.includes('javascript') ||
                          mimeType.includes('json') ||
                          mimeType.includes('xml');
            
            if (isText) {
              // Text content is already decoded, no need for atob
              try {
                const textContent = fileData.data;
                const ext = getExtensionFromMime(mimeType);
                markdown += `\n### File: ${driveId}.${ext}\n\`\`\`${ext}\n${textContent}\n\`\`\`\n\n`;
              } catch (error) {
                console.error(`Failed to process text ${driveId}:`, error);
                markdown += `- [Document](https://drive.google.com/file/d/${driveId}/view) (Failed to process)\n`;
              }
            } else if (zip) {
              // Binary handling inside ZIP
              if (filename.startsWith('drive_image_') && config.includeImages) {
                try {
                  const ext = getExtensionFromMime(mimeType);
                  const path = `assets/images/${driveId}.${ext}`;
                  const blob = base64ToBlob(fileData.data);
                  if (blob.size > 0) {
                    zip.file(path, blob);
                    markdown += `- ![Image](${path})\n`;
                  } else {
                    markdown += `- [Image on Drive](https://drive.google.com/file/d/${driveId}/view) (Failed to decode)\n`;
                  }
                } catch (error) {
                  console.error('Failed to process image:', error);
                  markdown += `- [Image on Drive](https://drive.google.com/file/d/${driveId}/view) (Error)\n`;
                }
              } else if (filename.startsWith('drive_doc_') && config.includePDFs) {
                try {
                  const path = `assets/documents/${driveId}.pdf`;
                  const blob = base64ToBlob(fileData.data);
                  if (blob.size > 0) {
                    zip.file(path, blob);
                    markdown += `- [PDF Document](${path})\n`;
                  } else {
                    markdown += `- [Document on Drive](https://drive.google.com/file/d/${driveId}/view) (Failed to decode)\n`;
                  }
                } catch (error) {
                  console.error(`Failed to process PDF ${driveId}:`, error);
                  markdown += `- [Document on Drive](https://drive.google.com/file/d/${driveId}/view) (Error: ${(error as Error).message})\n`;
                }
              } else {
                const type = filename.startsWith('drive_doc_') ? 'Document' : 'Image';
                markdown += `- [${type} on Drive](https://drive.google.com/file/d/${driveId}/view)\n`;
              }
            } else {
              const type = filename.startsWith('drive_doc_') ? 'Document' : 'Image';
              markdown += `- [${type} on Drive](https://drive.google.com/file/d/${driveId}/view)\n`;
            }
          } else {
            const type = filename.startsWith('drive_doc_') ? 'Document' : 'Image';
            markdown += `- [${type} on Drive](https://drive.google.com/file/d/${driveId}/view)\n`;
          }
        } else {
          markdown += `- ${filename}\n`;
        }
      }
      markdown += `\n`;
    }

    markdown += `---\n\n`;
  }

  if (zip) {
    zip.file('chat_log.md', markdown);
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadFile(blob, `chat_export_${getTimestamp()}.zip`, 'application/zip');
  } else {
    downloadFile(markdown, `chat_export_${getTimestamp()}.md`, 'text/markdown');
  }
}


function base64ToBlob(base64: string): Blob {
  try {
    // Validate base64 string
    if (!base64 || typeof base64 !== 'string') {
      throw new Error('Invalid base64 input');
    }
    
    // Remove any whitespace or newlines
    const cleanBase64 = base64.replace(/\s/g, '');
    
    // Check if it's valid base64
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleanBase64)) {
      throw new Error('String contains invalid base64 characters');
    }
    
    const byteCharacters = atob(cleanBase64);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray]);
  } catch (error) {
    console.error('Failed to decode base64:', error);
    return new Blob([]);
  }
}

function getExtensionFromMime(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'text/plain': 'txt',
    'text/html': 'html',
    'text/css': 'css',
    'text/javascript': 'js',
    'application/javascript': 'js',
    'application/json': 'json',
    'application/xml': 'xml',
    'text/xml': 'xml',
    'text/markdown': 'md',
    'application/pdf': 'pdf',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp'
  };
  
  return mimeMap[mimeType] || 'txt';
}

async function downloadFromDrive(fileId: string, token?: string): Promise<{ data: string; mimeType: string }> {
  // Send message to background script to download
  const response = await chrome.runtime.sendMessage({
    action: 'downloadDriveFile',
    fileId,
    token
  });

  if (!response.success) {
    throw new Error(response.error);
  }

  // Background script returns { success: true, data, mimeType }
  // We need to return { data, mimeType }
  return { data: response.data, mimeType: response.mimeType };
}

function downloadFile(content: string | Blob, filename: string, mimeType: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
}
