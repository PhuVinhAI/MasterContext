// src/scenes/settings/ProfileTab.tsx
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FolderUp, Save, Loader2, GitBranch, Copy, Check } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { message } from "@tauri-apps/plugin-dialog";

interface ProfileTabProps {
  syncEnabled: boolean;
  handleToggleSync: (enabled: boolean) => void;
  syncPath: string | null;
  handleChooseSyncPath: () => void;
  alwaysApplyText: string | null;
  setAlwaysApplyText: (text: string) => Promise<void>;
  appendIdePrompt: boolean;
  setAppendIdePrompt: (enabled: boolean) => void;
  appendGroupPrompt: boolean;
  setAppendGroupPrompt: (enabled: boolean) => void;
  appendJulesPrompt: boolean;
  setAppendJulesPrompt: (enabled: boolean) => void;
  gitExportModeIsContext: boolean;
  setGitExportMode: (enabled: boolean) => Promise<void>;
}

export function ProfileTab({
  syncEnabled,
  handleToggleSync,
  syncPath,
  handleChooseSyncPath,
  alwaysApplyText,
  setAlwaysApplyText,
  appendIdePrompt,
  setAppendIdePrompt,
  appendGroupPrompt,
  setAppendGroupPrompt,
  appendJulesPrompt,
  setAppendJulesPrompt,
  gitExportModeIsContext,
  setGitExportMode,
}: ProfileTabProps) {
  const { t } = useTranslation();
  const [localText, setLocalText] = useState("");
  const [isSavingText, setIsSavingText] = useState(false);
  const [isCopiedPrompt, setIsCopiedPrompt] = useState(false);
  const [isCopiedGroupPrompt, setIsCopiedGroupPrompt] = useState(false);
  const [isCopiedJulesPrompt, setIsCopiedJulesPrompt] = useState(false);

  const handleCopyIdePrompt = async () => {
    try {
      const content = await invoke<string>("get_resource_file_content", { filename: "code.md" });
      if (content) {
        await writeText(content);
        setIsCopiedPrompt(true);
        setTimeout(() => setIsCopiedPrompt(false), 2000);
      }
    } catch (error) {
      console.error("Failed to copy IDE prompt:", error);
      await message(t("errors.copyFailed", { error }), { title: t("common.error"), kind: "error" });
    }
  };

  const handleCopyGroupPrompt = async () => {
    try {
      const content = await invoke<string>("get_resource_file_content", { filename: "group.md" });
      if (content) {
        await writeText(content);
        setIsCopiedGroupPrompt(true);
        setTimeout(() => setIsCopiedGroupPrompt(false), 2000);
      }
    } catch (error) {
      console.error("Failed to copy Group prompt:", error);
      await message(t("errors.copyFailed", { error }), { title: t("common.error"), kind: "error" });
    }
  };

  const handleCopyJulesPrompt = async () => {
    try {
      const content = await invoke<string>("get_resource_file_content", { filename: "jules.md" });
      if (content) {
        await writeText(content);
        setIsCopiedJulesPrompt(true);
        setTimeout(() => setIsCopiedJulesPrompt(false), 2000);
      }
    } catch (error) {
      console.error("Failed to copy Jules prompt:", error);
      await message(t("errors.copyFailed", { error }), { title: t("common.error"), kind: "error" });
    }
  };

  useEffect(() => {
    setLocalText(alwaysApplyText || "");
  }, [alwaysApplyText]);

  const handleSaveText = async () => {
    setIsSavingText(true);
    await setAlwaysApplyText(localText);
    setIsSavingText(false);
  };
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">{t("settings.profile.title")}</h2>
      <div className="space-y-4 rounded-lg border p-4">
        <h3 className="font-semibold">
          {t("settings.profile.autoSync.title")}
        </h3>
        <div className="flex items-center justify-between">
          <Label htmlFor="sync-toggle" className="flex flex-col items-start">
            <span>{t("settings.profile.autoSync.enable.label")}</span>
            <span className="text-xs text-muted-foreground">
              {t("settings.profile.autoSync.enable.description")}
            </span>
          </Label>
          <Switch
            id="sync-toggle"
            checked={syncEnabled}
            onCheckedChange={handleToggleSync}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sync-path">
            {t("settings.profile.autoSync.folder.label")}
          </Label>
          <div className="flex items-center gap-2">
            <div
              id="sync-path"
              className="flex-grow truncate rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground"
            >
              {syncPath || t("settings.profile.autoSync.folder.placeholder")}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={handleChooseSyncPath}
            >
              <FolderUp className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <div className="space-y-4 rounded-lg border p-4">
        <h3 className="font-semibold flex items-center gap-2">
          <GitBranch className="h-4 w-4" /> {t("settings.profile.git.title")}
        </h3>
        <div className="flex items-center justify-between">
          <Label
            htmlFor="git-export-mode-toggle"
            className="flex flex-col items-start"
          >
            <span>{t("settings.profile.git.contextMode.label")}</span>
            <span className="text-xs text-muted-foreground">
              {t("settings.profile.git.contextMode.description")}
            </span>
          </Label>
          <Switch
            id="git-export-mode-toggle"
            checked={gitExportModeIsContext}
            onCheckedChange={setGitExportMode}
          />
        </div>
      </div>
      <div className="space-y-4 rounded-lg border p-4 flex flex-col">
        <h3 className="font-semibold">
          {t("settings.profile.alwaysApply.title")}
        </h3>
        <div className="flex items-center justify-between mb-4 gap-4">
          <Label htmlFor="append-ide-prompt" className="flex flex-col items-start gap-1 flex-1">
            <span>{t("settings.profile.alwaysApply.appendIde.label")}</span>
            <span className="text-xs text-muted-foreground">
              {t("settings.profile.alwaysApply.appendIde.description")}
            </span>
          </Label>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopyIdePrompt}
              title={t("settings.profile.alwaysApply.appendIde.copyTooltip")}
              className="h-8 w-8"
            >
              {isCopiedPrompt ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Switch
              id="append-ide-prompt"
              checked={appendIdePrompt}
              onCheckedChange={setAppendIdePrompt}
            />
          </div>
        </div>
        <div className="flex items-center justify-between mb-4 gap-4">
          <Label htmlFor="append-group-prompt" className="flex flex-col items-start gap-1 flex-1">
            <span>{t("settings.profile.alwaysApply.appendGroup.label")}</span>
            <span className="text-xs text-muted-foreground">
              {t("settings.profile.alwaysApply.appendGroup.description")}
            </span>
          </Label>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopyGroupPrompt}
              title={t("settings.profile.alwaysApply.appendGroup.copyTooltip")}
              className="h-8 w-8"
            >
              {isCopiedGroupPrompt ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Switch
              id="append-group-prompt"
              checked={appendGroupPrompt}
              onCheckedChange={setAppendGroupPrompt}
            />
          </div>
        </div>
        <div className="flex items-center justify-between mb-4 gap-4">
          <Label htmlFor="append-jules-prompt" className="flex flex-col items-start gap-1 flex-1">
            <span>{t("settings.profile.alwaysApply.appendJules.label")}</span>
            <span className="text-xs text-muted-foreground">
              {t("settings.profile.alwaysApply.appendJules.description")}
            </span>
          </Label>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopyJulesPrompt}
              title={t("settings.profile.alwaysApply.appendJules.copyTooltip")}
              className="h-8 w-8"
            >
              {isCopiedJulesPrompt ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Switch
              id="append-jules-prompt"
              checked={appendJulesPrompt}
              onCheckedChange={setAppendJulesPrompt}
            />
          </div>
        </div>
        <div className="space-y-2 flex-grow flex flex-col">
          <Label htmlFor="always-apply-text">
            {t("settings.profile.alwaysApply.description")}
          </Label>
          <Textarea
            id="always-apply-text"
            placeholder={t("settings.profile.alwaysApply.placeholder")}
            className="flex-1 resize-y min-h-[120px]"
            value={localText}
            onChange={(e) => setLocalText(e.target.value)}
            disabled={isSavingText}
          />
        </div>
        <Button
          onClick={handleSaveText}
          disabled={isSavingText || localText === (alwaysApplyText || "")}
          className="w-full mt-4"
        >
          {isSavingText ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {t("settings.profile.alwaysApply.saveButton")}
        </Button>
      </div>
    </div>
  );
}
