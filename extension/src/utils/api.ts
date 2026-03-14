import type { PromptData, ChatTurn } from '../types';

export async function fetchPromptDataFromDrive(promptId: string, token?: string): Promise<PromptData | null> {
  try {
    // Use background script to avoid CORS
    const response = await chrome.runtime.sendMessage({
      action: 'fetchPromptData',
      promptId,
      token
    });

    if (!response.success) {
      throw new Error(response.error);
    }

    return response.data as PromptData;
  } catch (error) {
    console.error('Failed to fetch prompt data from Drive:', error);
    return null;
  }
}

export function convertPromptDataToChatTurns(data: PromptData): ChatTurn[] {
  const chatTurns: ChatTurn[] = [];
  const chunks = data.chunkedPrompt.chunks;

  let currentTurn: ChatTurn | null = null;

  for (const chunk of chunks) {
    // Skip empty chunks
    if (!chunk.text && !chunk.parts && !chunk.inlineFile && !chunk.driveDocument && !chunk.driveImage) continue;

    const role = chunk.role === 'user' ? 'user' : 'model';
    
    // Nếu role khác với turn hiện tại, tạo turn mới
    if (!currentTurn || currentTurn.role !== role) {
      if (currentTurn) {
        chatTurns.push(currentTurn);
      }
      currentTurn = {
        role,
        content: '',
        thoughts: undefined,
        attachments: []
      };
    }

    // Handle inline file
    if (chunk.inlineFile) {
      const filename = `inline_file.${chunk.inlineFile.mimeType.split('/')[1] || 'txt'}`;
      currentTurn.attachments!.push(filename);
      // Decode base64 content if it's text
      if (chunk.inlineFile.mimeType.startsWith('text/')) {
        try {
          currentTurn.content += atob(chunk.inlineFile.data);
        } catch {
          currentTurn.content += `[File: ${filename}]`;
        }
      }
    }

    // Handle Drive document
    if (chunk.driveDocument) {
      currentTurn.attachments!.push(`drive_doc_${chunk.driveDocument.id}`);
    }

    // Handle Drive image
    if (chunk.driveImage) {
      currentTurn.attachments!.push(`drive_image_${chunk.driveImage.id}`);
    }

    // Handle text and thoughts
    if (chunk.parts) {
      for (const part of chunk.parts) {
        if (part.thought) {
          currentTurn.thoughts = (currentTurn.thoughts || '') + part.text;
        } else {
          currentTurn.content += part.text;
        }
      }
    } else if (chunk.text) {
      if (chunk.isThought) {
        currentTurn.thoughts = (currentTurn.thoughts || '') + chunk.text;
      } else {
        currentTurn.content += chunk.text;
      }
    }
  }

  // Push last turn
  if (currentTurn) {
    chatTurns.push(currentTurn);
  }

  // Clean up turns
  return chatTurns.map(turn => ({
    ...turn,
    content: turn.content.trim(),
    thoughts: turn.thoughts?.trim() || undefined,
    attachments: turn.attachments && turn.attachments.length > 0 ? turn.attachments : undefined
  }));
}

export function extractPromptIdFromUrl(url: string): string | null {
  const match = url.match(/\/prompts\/([^/?]+)/);
  return match ? match[1] : null;
}
