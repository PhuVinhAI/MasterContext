import { create } from 'zustand';
import type { ChatTurn } from '@/types';

interface EditorState {
  chatTurns: ChatTurn[];
  originalChatTurns: ChatTurn[]; // Lưu data gốc để restore
  selectedTurns: Set<number>;
  exportThinkingMap: Map<number, boolean>; // Map turn index -> export thinking
  showThinking: boolean;
  includeImages: boolean;
  includePDFs: boolean;
  driveToken: string;
  
  // Actions
  setChatTurns: (turns: ChatTurn[]) => void;
  restoreOriginalData: () => void;
  toggleTurnSelection: (index: number) => void;
  selectAllTurns: () => void;
  deselectAllTurns: () => void;
  setExportThinking: (index: number, value: boolean) => void;
  toggleAllThinking: () => void;
  setShowThinking: (show: boolean) => void;
  setIncludeImages: (include: boolean) => void;
  setIncludePDFs: (include: boolean) => void;
  setDriveToken: (token: string) => void;
  removeTurn: (index: number) => void;
  removeAttachment: (turnIndex: number, attachmentIndex: number) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  chatTurns: [],
  originalChatTurns: [],
  selectedTurns: new Set(),
  exportThinkingMap: new Map(),
  showThinking: true,
  includeImages: true,
  includePDFs: true,
  driveToken: '',
  
  setChatTurns: (turns) => {
    const thinkingMap = new Map<number, boolean>();
    turns.forEach((turn, i) => {
      if (turn.thoughts) {
        thinkingMap.set(i, true); // Mặc định export thinking
      }
    });
    set({ 
      chatTurns: turns,
      originalChatTurns: JSON.parse(JSON.stringify(turns)), // Deep clone để lưu data gốc
      selectedTurns: new Set(turns.map((_, i) => i)),
      exportThinkingMap: thinkingMap
    });
  },
  
  restoreOriginalData: () => set((state) => {
    const turns = JSON.parse(JSON.stringify(state.originalChatTurns)); // Deep clone
    const thinkingMap = new Map<number, boolean>();
    turns.forEach((turn: ChatTurn, i: number) => {
      if (turn.thoughts) {
        thinkingMap.set(i, true);
      }
    });
    return {
      chatTurns: turns,
      selectedTurns: new Set(turns.map((_: ChatTurn, i: number) => i)),
      exportThinkingMap: thinkingMap
    };
  }),
  
  toggleTurnSelection: (index) => set((state) => {
    const newSelected = new Set(state.selectedTurns);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    return { selectedTurns: newSelected };
  }),
  
  selectAllTurns: () => set((state) => ({
    selectedTurns: new Set(state.chatTurns.map((_, i) => i))
  })),
  
  deselectAllTurns: () => set({ selectedTurns: new Set() }),
  
  setExportThinking: (index, value) => set((state) => {
    const newMap = new Map(state.exportThinkingMap);
    newMap.set(index, value);
    return { exportThinkingMap: newMap };
  }),
  
  toggleAllThinking: () => set((state) => {
    const newMap = new Map(state.exportThinkingMap);
    const allChecked = Array.from(newMap.values()).every(v => v);
    newMap.forEach((_, key) => newMap.set(key, !allChecked));
    return { exportThinkingMap: newMap, showThinking: !allChecked };
  }),
  
  setShowThinking: (show) => set((state) => {
    const newMap = new Map(state.exportThinkingMap);
    newMap.forEach((_, key) => newMap.set(key, show));
    return { showThinking: show, exportThinkingMap: newMap };
  }),
  setIncludeImages: (include) => set({ includeImages: include }),
  setIncludePDFs: (include) => set({ includePDFs: include }),
  setDriveToken: (token) => set({ driveToken: token }),
  
  removeTurn: (index) => set((state) => {
    const newTurns = state.chatTurns.filter((_: ChatTurn, i: number) => i !== index);
    const newSelected = new Set(state.selectedTurns);
    newSelected.delete(index);
    // Adjust indices
    const adjustedSelected = new Set<number>();
    newSelected.forEach(i => {
      if (i > index) adjustedSelected.add(i - 1);
      else if (i < index) adjustedSelected.add(i);
    });
    return { chatTurns: newTurns, selectedTurns: adjustedSelected };
  }),
  
  removeAttachment: (turnIndex, attachmentIndex) => set((state) => {
    const newTurns = [...state.chatTurns];
    const turn = newTurns[turnIndex];
    if (turn.attachments) {
      turn.attachments = turn.attachments.filter((_: string, i: number) => i !== attachmentIndex);
      if (turn.attachments.length === 0) {
        turn.attachments = undefined;
      }
    }
    return { chatTurns: newTurns };
  }),
}));
