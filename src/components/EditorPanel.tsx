// src/components/EditorPanel.tsx
import { useState, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore, useAppActions } from "@/store/appStore";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  X,
  Loader2,
  Scissors,
  FileX,
  Undo,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
// Import thư viện đầy đủ với tất cả ngôn ngữ
import hljs from "highlight.js";

export function EditorPanel() {
  const { t } = useTranslation();
  const {
    closeEditor,
    addExclusionRange,
    removeExclusionRange,
    clearExclusionRanges,
  } = useAppActions();
  const {
    activeEditorFile,
    activeEditorFileContent,
    isEditorLoading,
    activeEditorFileExclusions,
  } = useAppStore(
    useShallow((state) => ({
      activeEditorFile: state.activeEditorFile,
      activeEditorFileContent: state.activeEditorFileContent,
      isEditorLoading: state.isEditorLoading,
      activeEditorFileExclusions: state.activeEditorFileExclusions,
    }))
  );

  const [selection, setSelection] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const codeContainerRef = useRef<HTMLElement>(null);

  const language = useMemo(() => {
    if (!activeEditorFile) return "plaintext";
    const extension = activeEditorFile.split(".").pop()?.toLowerCase();
    if (extension && hljs.getLanguage(extension)) {
      return extension;
    }
    switch (extension) {
      // Web & Scripting
      case "tsx":
        return "typescript";
      case "jsx":
        return "javascript";
      case "html":
        return "xml";
      case "vue":
        return "xml"; // Vue SFC templates are XML-like
      case "scss":
        return "scss";
      case "less":
        return "less";
      case "yml":
        return "yaml";
      case "md":
        return "markdown";

      // Backend & Systems
      case "rs":
        return "rust";
      case "py":
        return "python";
      case "java":
        return "java";
      case "kt":
        return "kotlin";
      case "go":
        return "go";
      case "php":
        return "php";
      case "rb":
        return "ruby";
      case "cs":
        return "csharp";
      case "cpp":
        return "cpp";
      case "c":
        return "c";
      case "h":
        return "c";

      // Shell & Config
      case "sh":
        return "shell";
      case "ps1":
        return "powershell";
      case "dockerfile":
        return "dockerfile";
      case "toml":
        return "toml";

      // Other common languages
      case "sql":
        return "sql";
      case "swift":
        return "swift";
      default:
        return "plaintext";
    }
  }, [activeEditorFile]);

  // Component con để render code đã được tô màu một cách an toàn
  const HighlightedCode = ({ code, lang }: { code: string; lang: string }) => {
    const highlighted = useMemo(
      () =>
        hljs.highlight(code, { language: lang, ignoreIllegals: true }).value,
      [code, lang]
    );
    return <span dangerouslySetInnerHTML={{ __html: highlighted }} />;
  };

  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (
      !selection ||
      selection.rangeCount === 0 ||
      !codeContainerRef.current ||
      !activeEditorFileContent ||
      selection.isCollapsed
    ) {
      setSelection(null);
      return;
    }

    const range = selection.getRangeAt(0);

    // Create a range from the start of the code block to the start of the selection
    const preSelectionRange = document.createRange();
    preSelectionRange.selectNodeContents(codeContainerRef.current);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);

    // The length of the text in this range is the offset in a "normalized" string (where all line endings are \n)
    const startInNormalized = preSelectionRange.toString().length;
    const endInNormalized = startInNormalized + range.toString().length;

    // Function to map offsets from the browser's normalized view (LF) to the original string (potentially CRLF).
    // This is necessary because the browser treats CRLF as a single LF, causing offset mismatches.
    const mapToOriginalOffsets = (normStart: number, normEnd: number) => {
      let originalStart = -1,
        originalEnd = -1;
      let normalizedIdx = 0;
      for (let i = 0; i < activeEditorFileContent.length; i++) {
        if (normalizedIdx === normStart) originalStart = i;
        if (normalizedIdx === normEnd) {
          originalEnd = i;
          break;
        }
        if (
          activeEditorFileContent[i] === "\r" &&
          activeEditorFileContent[i + 1] === "\n"
        ) {
          i++; // Skip the \n as it's part of the CRLF pair, but normalizedIdx only increments once.
        }
        normalizedIdx++;
      }
      if (originalEnd === -1) originalEnd = activeEditorFileContent.length; // Reached end of string
      return { start: originalStart, end: originalEnd };
    };

    const { start, end } = mapToOriginalOffsets(
      startInNormalized,
      endInNormalized
    );
    setSelection(
      start !== -1 && end !== -1 && start < end ? { start, end } : null
    );
  };

  const handleExcludeClick = () => {
    if (selection) {
      addExclusionRange(selection.start, selection.end);
      setSelection(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  const renderContentWithExclusions = (
    content: string | null
  ): React.ReactNode => {
    if (!content) return null;

    if (
      !activeEditorFileExclusions ||
      activeEditorFileExclusions.length === 0
    ) {
      return <HighlightedCode code={content} lang={language} />;
    }

    const sortedRanges = [...activeEditorFileExclusions].sort(
      (a, b) => a[0] - b[0]
    );
    const parts = [];
    let lastIndex = 0;

    sortedRanges.forEach((range, i) => {
      if (range[0] > lastIndex) {
        const codeSnippet = content.substring(lastIndex, range[0]);
        parts.push(
          <HighlightedCode
            key={`incl-${i}`}
            code={codeSnippet}
            lang={language}
          />
        );
      }
      parts.push(
        <TooltipProvider key={`excl-tip-${i}`} delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="bg-destructive/20 cursor-pointer hover:bg-destructive/40 rounded-sm"
                onClick={() => removeExclusionRange(range)}
              >
                <HighlightedCode
                  code={content.substring(range[0], range[1])}
                  lang={language}
                />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p className="flex items-center gap-2">
                <Undo className="h-3 w-3" /> {t("editorPanel.undoExclude")}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
      lastIndex = range[1];
    });

    if (lastIndex < content.length) {
      const finalSnippet = content.substring(lastIndex);
      parts.push(
        <HighlightedCode key="final-incl" code={finalSnippet} lang={language} />
      );
    }

    return parts;
  };

  const memoizedContent = useMemo(
    () => renderContentWithExclusions(activeEditorFileContent),
    [
      activeEditorFileContent,
      activeEditorFileExclusions,
      language,
    ]
  );

  if (!activeEditorFile) {
    return null;
  }

  return (
    <div className="flex flex-col h-full bg-muted/20">
      <header className="flex items-center justify-between p-2 pl-4 border-b shrink-0 h-14">
        <div className="flex items-center gap-2 min-w-0">
          <p className="font-mono text-sm truncate" title={activeEditorFile}>
            {activeEditorFile}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {activeEditorFileExclusions && activeEditorFileExclusions.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={clearExclusionRanges}
              title={t("editorPanel.clearExclusionsTooltip")}
            >
              <FileX className="h-4 w-4 text-destructive" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={closeEditor}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <main className="flex-1 overflow-auto relative">
        {selection && (
          <Button
            className="absolute z-10 top-2 right-2 animate-in fade-in"
            size="sm"
            onClick={handleExcludeClick}
          >
            <Scissors className="mr-2 h-4 w-4" />
            {t("editorPanel.excludeSelection")}
          </Button>
        )}
        {isEditorLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea
            className="h-full"
            onMouseUp={handleMouseUp}
            onMouseDown={() => setSelection(null)}
          >
            <pre className="p-4 text-xs hljs">
              <code ref={codeContainerRef}>{memoizedContent}</code>
            </pre>
          </ScrollArea>
        )}
      </main>
    </div>
  );
}
