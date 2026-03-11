// src/scenes/GroupEditorPanel.tsx
import { useCallback, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore, useAppActions } from "@/store/appStore";
import { useShallow } from "zustand/react/shallow";
import { FileTreeView, type FileNode } from "@/components/FileTreeView";
import { Button } from "@/components/ui/button";
import {
  CheckCheck,
  XCircle,
  X,
  Search,
  GitMerge,
  Loader2,
} from "lucide-react";
import { Scissors } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const filterNode = (node: FileNode, searchTerm: string): FileNode | null => {
  const term = searchTerm.toLowerCase();
  const isMatch = node.name.toLowerCase().includes(term);

  if (!node.children) {
    return isMatch ? node : null;
  }

  if (isMatch) {
    return node;
  }

  const filteredChildren = node.children
    .map((child) => filterNode(child, searchTerm))
    .filter(Boolean) as FileNode[];

  if (filteredChildren.length > 0) {
    return { ...node, children: filteredChildren };
  }

  return null;
};

// --- HÀM LỌC MỚI: Chỉ giữ lại các file có vùng loại trừ ---
const filterForExcludedFiles = (
  node: FileNode,
  metadataCache: Record<string, any>
): FileNode | null => {
  if (!node.children) {
    const meta = metadataCache[node.path];
    const hasExclusions = meta?.excluded_ranges?.length > 0;
    return hasExclusions ? node : null;
  }

  const filteredChildren = node.children
    .map((child) => filterForExcludedFiles(child, metadataCache))
    .filter(Boolean) as FileNode[];

  if (filteredChildren.length > 0) {
    return { ...node, children: filteredChildren };
  }

  return null;
};

// --- HÀM LỌC MỚI: Chỉ giữ lại các file có thay đổi Git ---
const filterForChangedFiles = (
  node: FileNode,
  changedPaths: Set<string>
): FileNode | null => {
  if (!node.children) {
    return changedPaths.has(node.path) ? node : null;
  }

  const filteredChildren = node.children
    .map((child) => filterForChangedFiles(child, changedPaths))
    .filter(Boolean) as FileNode[];

  if (filteredChildren.length > 0) {
    return { ...node, children: filteredChildren };
  }
  return null;
};

export function GroupEditorPanel() {
  const { t } = useTranslation();
  const {
    toggleEditingPath,
    selectAllFiles,
    attachItemToAi,
    deselectAllFiles,
    cancelEditingGroup,
  } = useAppActions();

  const {
    group,
    fileTree,
    isSaving,
    fileMetadataCache,
    tempSelectedPaths,
    gitStatus,
  } = useAppStore(
    useShallow((state) => ({
      group: state.groups.find((g) => g.id === state.editingGroupId),
      fileTree: state.fileTree,
      isSaving: state.isUpdatingGroupId === state.editingGroupId,
      fileMetadataCache: state.fileMetadataCache,
      tempSelectedPaths: state.tempSelectedPaths,
      gitStatus: state.gitStatus,
    }))
  );

  const [showOnlyExcluded, setShowOnlyExcluded] = useState(false);
  const [showOnlyChanged, setShowOnlyChanged] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const changedFilesSet = useMemo(() => {
    if (!gitStatus || !gitStatus.files) {
      return new Set<string>();
    }
    return new Set(Object.keys(gitStatus.files));
  }, [gitStatus]);

  const hasAnyExclusions = useMemo(() => {
    if (!fileMetadataCache) return false;
    return Object.values(fileMetadataCache).some(
      (meta) => (meta.excluded_ranges?.length ?? 0) > 0
    );
  }, [fileMetadataCache]);

  const handleTogglePath = useCallback(
    (toggledNode: FileNode, isSelected: boolean) => {
      toggleEditingPath(toggledNode, isSelected);
    },
    [toggleEditingPath]
  );

  const filteredFileTree = useMemo(() => {
    if (!fileTree || !fileMetadataCache) return null;

    let tree: FileNode | null = fileTree;

    if (showOnlyChanged && tree) {
      tree = filterForChangedFiles(tree, changedFilesSet);
    }

    if (tree && showOnlyExcluded) {
      const excludedTree = filterForExcludedFiles(tree, fileMetadataCache);
      tree = excludedTree;
    }

    if (tree && searchTerm.trim()) {
      tree = filterNode(tree, searchTerm);
    }

    return tree;
  }, [
    fileTree,
    fileMetadataCache,
    searchTerm,
    showOnlyExcluded,
    showOnlyChanged,
    changedFilesSet,
  ]);

  if (!group || !fileTree || tempSelectedPaths === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between p-4 border-b shrink-0 gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold truncate">
              {t("groupEditor.title", { name: group.name })}
            </h1>
            {isSaving && (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            )}
          </div>
          <p className="text-muted-foreground">
            {t("groupEditor.description")}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={cancelEditingGroup}>
          <X className="h-5 w-5" />
        </Button>
      </header>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 border-b shrink-0 bg-muted/50">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={selectAllFiles}>
            <CheckCheck className="mr-2 h-4 w-4" />
            {t("groupEditor.selectAll")}
          </Button>
          <Button variant="outline" size="sm" onClick={deselectAllFiles}>
            <XCircle className="mr-2 h-4 w-4" />
            {t("groupEditor.deselectAll")}
          </Button>
        </div>
      </div>
      {/* Search Bar */}
      <div className="p-2 border-b shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("groupEditor.searchPlaceholder")}
            className="pl-8 pr-[13rem]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center">
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-7 w-7",
                      showOnlyExcluded && "bg-accent text-accent-foreground"
                    )}
                    onClick={() => setShowOnlyExcluded(!showOnlyExcluded)}
                    disabled={!showOnlyExcluded && !hasAnyExclusions}
                  >
                    <Scissors className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {showOnlyExcluded
                      ? t("groupEditor.unfilterExcludedTooltip")
                      : t("groupEditor.filterExcludedTooltip")}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-7 w-7",
                      showOnlyChanged && "bg-accent text-accent-foreground"
                    )}
                    onClick={() => setShowOnlyChanged(!showOnlyChanged)}
                    disabled={!showOnlyChanged && changedFilesSet.size === 0}
                  >
                    <GitMerge className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {showOnlyChanged
                      ? t("groupEditor.unfilterChangedTooltip")
                      : t("groupEditor.filterChangedTooltip")}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
      {/* File Tree */}
      <main className="flex-1 overflow-hidden">
        <ScrollArea className="h-full p-4">
          {filteredFileTree ? (
            <FileTreeView
              node={filteredFileTree}
              selectedPaths={tempSelectedPaths}
              onToggle={handleTogglePath}
              gitStatus={gitStatus?.files ?? null}
              onAttachFile={attachItemToAi}
            />
          ) : (
            <div className="text-center text-muted-foreground p-4">
              {
                showOnlyChanged
                  ? t("groupEditor.noChangedFiles")
                  : showOnlyExcluded
                  ? t("groupEditor.noExcludedFiles")
                  : searchTerm
                  ? t("groupEditor.noSearchResults", { searchTerm })
                  : ""
              }
            </div>
          )}
        </ScrollArea>
      </main>
    </div>
  );
}
