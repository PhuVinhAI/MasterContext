import { useEffect, useState } from 'react';
import { useEditorStore } from '@/lib/store';
import { fetchPromptDataFromDrive, convertPromptDataToChatTurns } from '@/utils/api';

export function useLoadChatData() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { setChatTurns, setDriveToken } = useEditorStore();

  useEffect(() => {
    async function loadData() {
      try {
        // Lấy promptId từ URL params
        const params = new URLSearchParams(window.location.search);
        const promptId = params.get('promptId');
        
        if (!promptId) {
          setError('Không tìm thấy prompt ID trong URL');
          setIsLoading(false);
          return;
        }

        // Load token từ storage
        const result = await chrome.storage.local.get(['driveToken']);
        const token = (result.driveToken as string) || undefined;
        
        if (token) {
          setDriveToken(token);
        }

        // Fetch data từ Drive qua background script
        const promptData = await fetchPromptDataFromDrive(promptId, token);
        
        if (!promptData) {
          setError('Không thể tải dữ liệu từ Drive');
          setIsLoading(false);
          return;
        }

        // Convert sang chat turns
        const chatTurns = convertPromptDataToChatTurns(promptData);
        setChatTurns(chatTurns);
        
        setIsLoading(false);
      } catch (err) {
        setError((err as Error).message);
        setIsLoading(false);
      }
    }

    loadData();
  }, [setChatTurns, setDriveToken]);

  return { isLoading, error };
}
