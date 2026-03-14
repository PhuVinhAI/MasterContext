export interface ExportConfig {
  includeImages: boolean;
  includePDFs: boolean;
  apiToken?: string;
}

export interface ChatTurn {
  role: 'user' | 'model';
  content: string;
  thoughts?: string;
  attachments?: string[];
}

export interface PromptChunk {
  text?: string;
  role: string;
  tokenCount?: number;
  isThought?: boolean;
  finishReason?: string;
  parts?: Array<{
    text: string;
    thought?: boolean;
  }>;
  inlineFile?: {
    mimeType: string;
    data: string; // base64
  };
  driveDocument?: {
    id: string;
  };
  driveImage?: {
    id: string;
  };
}

export interface PromptData {
  runSettings: any;
  systemInstruction: any;
  chunkedPrompt: {
    chunks: PromptChunk[];
    pendingInputs?: any[];
  };
}
