// src/components/GitPanel.tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore, useAppActions } from "@/store/appStore";
import { useShallow } from "zustand/react/shallow";
import {
  Loader2,
  GitBranch,
  AlertTriangle,
  Download,
  User,
  Calendar,
  MessageSquare,
  RefreshCw,
  Clipboard,
  Check,
  History,
  RotateCcw,
  Flame,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export function GitPanel() {
  const { t } = useTranslation();
  const {
    checkGitRepo,
    fetchGitCommits,
    exportCommitDiff,
    reloadGitCommits,
    copyCommitDiff,
    checkoutCommit,
    checkoutLatestBranch,
    switchBranch,
    resetAndForcePush,
    revertCommit,
  } = useAppActions();
  const {
    rootPath: state_rootPath,
    gitRepoInfo: state_gitRepoInfo,
    gitCommits: state_gitCommits,
    gitLogState: state_gitLogState,
    hasMoreCommits: state_hasMoreCommits,
    originalGitBranch: state_originalGitBranch,
    gitBranches: state_gitBranches,
  } = useAppStore(
    useShallow((state) => ({
      rootPath: state.rootPath,
      gitRepoInfo: state.gitRepoInfo,
      gitCommits: state.gitCommits,
      gitLogState: state.gitLogState,
      hasMoreCommits: state.hasMoreCommits,
      originalGitBranch: state.originalGitBranch,
      gitBranches: state.gitBranches,
    }))
  );
  const rootPath = state_rootPath;
  const gitRepoInfo = state_gitRepoInfo;
  const gitCommits = state_gitCommits;
  const gitLogState = state_gitLogState;
  const hasMoreCommits = state_hasMoreCommits;
  const originalGitBranch = state_originalGitBranch;
  const gitBranches = state_gitBranches;
  const gitExportModeIsContext = useAppStore(
    (state) => state.gitExportModeIsContext
  );

  const [copyingSha, setCopyingSha] = useState<string | null>(null);
  const [copiedSha, setCopiedSha] = useState<string | null>(null);
  const [checkoutSha, setCheckoutSha] = useState<string | null>(null);
  const [forcePushSha, setForcePushSha] = useState<string | null>(null);
  const [isForcePushing, setIsForcePushing] = useState(false);
  const [revertSha, setRevertSha] = useState<string | null>(null);
  const [isReverting, setIsReverting] = useState(false);

  const handleCopy = async (sha: string) => {
    setCopyingSha(sha);
    setCopiedSha(null);
    const success = await copyCommitDiff(sha);
    setCopyingSha(null);
    if (success) {
      setCopiedSha(sha);
      setTimeout(() => {
        setCopiedSha(null);
      }, 2000); // Reset icon after 2 seconds
    }
  };

  useEffect(() => {
    // CHỈ KIỂM TRA KHI CÓ ĐƯỜNG DẪN VÀ CHƯA CÓ THÔNG TIN REPO
    if (rootPath && !gitRepoInfo) {
      checkGitRepo();
    }
  }, [rootPath, gitRepoInfo, checkGitRepo]);

  const renderContent = () => {
    // SỬA LỖI TẠI ĐÂY: Chỉ hiển thị loading ban đầu khi chưa có thông tin repo
    if (!gitRepoInfo) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
          <Loader2 className="h-8 w-8 animate-spin mb-4" />
          <p>{t("gitPanel.checking")}</p>
        </div>
      );
    }

    if (!gitRepoInfo?.isRepository) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4 text-center">
          <AlertTriangle className="h-8 w-8 mb-4" />
          <p>{t("gitPanel.notARepo")}</p>
        </div>
      );
    }

    return (
      // Sử dụng Fragment để trả về nhiều phần tử, chúng sẽ trở thành con trực tiếp
      // của container `flex flex-col h-full` trong `GitPanel`
      <>
        {/* Phần URL, cố định, không cuộn */}
        {gitRepoInfo.remoteUrl && (
          <div className="p-2 border-b flex-shrink-0 space-y-2">
            <Badge variant="secondary" className="w-full justify-start">
              <GitBranch className="h-3 w-3 mr-2" />
              <span className="truncate text-xs">{gitRepoInfo.remoteUrl}</span>
            </Badge>
            <div className="flex items-center gap-2">
              <Select value={gitRepoInfo.currentBranch || ""} onValueChange={switchBranch}>
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue placeholder={t("gitPanel.branch")} />
                </SelectTrigger>
                <SelectContent>
                  {gitBranches.map((b) => (
                    <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        {/* Khu vực danh sách commit, co giãn và có thể cuộn */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-2 space-y-2">
            {gitCommits.map((commit) => {
              const isHeadOfMainBranch =
                commit.sha === gitRepoInfo?.mainBranchHeadSha;
              const isDetachedHead = !gitRepoInfo?.currentBranch;
              const isCurrentCommit = commit.sha === gitRepoInfo?.currentSha;

              return (
                <div
                  key={commit.sha}
                  className={cn(
                    "p-2 rounded-md border bg-background/50 space-y-2 transition-all",
                    isCurrentCommit && "ring-2 ring-primary/50 bg-primary/5"
                  )}
                >
                  <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                    <p className="font-mono text-xs text-blue-500 dark:text-blue-400 min-w-0 truncate">
                      {commit.sha.substring(0, 7)}
                    </p>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => handleCopy(commit.sha)}
                        className="h-7 w-7"
                        disabled={copyingSha === commit.sha}
                        title={t(
                          gitExportModeIsContext
                            ? "gitPanel.copyContextTooltip"
                            : "gitPanel.copyDiffTooltip"
                        )}
                      >
                        {copyingSha === commit.sha ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : copiedSha === commit.sha ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Clipboard className="h-3.5 w-3.5" />
                        )}
                      </Button>

                      {isHeadOfMainBranch &&
                      (isDetachedHead || !isCurrentCommit) ? (
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={checkoutLatestBranch}
                          className="h-7 w-7 border-green-500/50 text-green-600 hover:bg-green-500/10 dark:text-green-400 dark:hover:bg-green-500/10"
                          title={t("gitPanel.checkoutLatestTooltip", {
                            branch: originalGitBranch,
                          })}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => setCheckoutSha(commit.sha)}
                          className="h-7 w-7"
                          disabled={isCurrentCommit}
                          title={t("gitPanel.checkoutCommitTooltip")}
                        >
                          <History className="h-3.5 w-3.5" />
                        </Button>
                      )}

                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => exportCommitDiff(commit.sha)}
                        className="h-7 w-7"
                        title={t(
                          gitExportModeIsContext
                            ? "gitPanel.downloadContextTooltip"
                            : "gitPanel.downloadDiffTooltip"
                        )}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>

                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => setRevertSha(commit.sha)}
                        className="h-7 w-7 border-orange-500/50 text-orange-600 hover:bg-orange-500/10 dark:text-orange-400 dark:hover:bg-orange-500/10"
                        title={t("gitPanel.revertTooltip")}
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </Button>

                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => setForcePushSha(commit.sha)}
                        className="h-7 w-7 border-destructive/50 text-destructive hover:bg-destructive/10"
                        title={t("gitPanel.forcePushTooltip")}
                      >
                        <Flame className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p
                    className="text-sm font-medium leading-snug break-all"
                    title={commit.message}
                  >
                    <MessageSquare className="inline-block h-3.5 w-3.5 mr-1.5 align-middle text-muted-foreground" />
                    {commit.message}
                  </p>
                  <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground flex-wrap">
                    <span
                      className="flex items-center"
                      title={t("gitPanel.author")}
                    >
                      <User className="h-3 w-3 mr-1" /> {commit.author}
                    </span>
                    <span
                      className="flex items-center"
                      title={t("gitPanel.date")}
                    >
                      <Calendar className="h-3 w-3 mr-1" /> {commit.date}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
        {/* Phần chân panel, cố định, không cuộn */}
        <div className="p-2 border-t flex-shrink-0">
          {gitLogState === "loading_commits" && (
            <div className="flex items-center justify-center h-9">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {hasMoreCommits && gitLogState !== "loading_commits" && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fetchGitCommits(true)}
            >
              {t("gitPanel.loadMore")}
            </Button>
          )}
        </div>
      </>
    );
  };

  return (
    // Đây là container flexbox chính
    <div className="flex flex-col h-full bg-card">
      <header className="flex items-center justify-between p-4 border-b shrink-0">
        <h1 className="text-xl font-bold">{t("gitPanel.title")}</h1>
        {/* --- NÚT TẢI LẠI --- */}
        <Button
          variant="ghost"
          size="icon"
          onClick={reloadGitCommits}
          disabled={
            gitLogState === "loading_commits" || !gitRepoInfo?.isRepository
          }
          className="h-8 w-8"
          title={t("gitPanel.reloadTooltip")}
        >
          <RefreshCw
            className={`h-4 w-4 ${
              gitLogState === "loading_commits" ? "animate-spin" : ""
            }`}
          />
        </Button>
      </header>
      {/* Nội dung được render ở đây, là con trực tiếp của container flexbox */}
      {renderContent()}

      <AlertDialog
        open={!!checkoutSha}
        onOpenChange={(open) => !open && setCheckoutSha(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("gitPanel.checkoutDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span
                dangerouslySetInnerHTML={{
                  __html: t("gitPanel.checkoutDialog.description", {
                    sha: checkoutSha?.substring(0, 7),
                  }),
                }}
              />
              <br />
              <strong className="text-destructive">
                {t("gitPanel.checkoutDialog.warning")}
              </strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => checkoutSha && checkoutCommit(checkoutSha)}
              className="bg-destructive hover:bg-destructive/90"
            >
              {t("gitPanel.checkoutDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Force Push */}
      <AlertDialog
        open={!!forcePushSha}
        onOpenChange={(open) => !open && setForcePushSha(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <Flame className="h-5 w-5" />
              {t("gitPanel.forcePushDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span dangerouslySetInnerHTML={{
                __html: t("gitPanel.forcePushDialog.description", {
                  sha: forcePushSha?.substring(0, 7),
                })
              }} />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isForcePushing}>{t("common.cancel")}</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={isForcePushing}
              onClick={async () => {
                if (forcePushSha) {
                  setIsForcePushing(true);
                  await resetAndForcePush(forcePushSha);
                  setIsForcePushing(false);
                  setForcePushSha(null);
                }
              }}
            >
              {isForcePushing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t("gitPanel.forcePushDialog.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Revert */}
      <AlertDialog
        open={!!revertSha}
        onOpenChange={(open) => !open && setRevertSha(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-orange-500 flex items-center gap-2">
              <Undo2 className="h-5 w-5" />
              {t("gitPanel.revertDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span dangerouslySetInnerHTML={{
                __html: t("gitPanel.revertDialog.description", {
                  sha: revertSha?.substring(0, 7),
                })
              }} />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isReverting}>{t("common.cancel")}</AlertDialogCancel>
            <Button
              variant="outline"
              className="border-orange-500 text-orange-600 hover:bg-orange-500/10 dark:text-orange-400"
              disabled={isReverting}
              onClick={async () => {
                if (revertSha) {
                  setIsReverting(true);
                  await revertCommit(revertSha);
                  setIsReverting(false);
                  setRevertSha(null);
                }
              }}
            >
              {isReverting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t("gitPanel.revertDialog.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
