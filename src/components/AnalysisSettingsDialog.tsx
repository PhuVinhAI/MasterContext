// src/components/AnalysisSettingsDialog.tsx
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface AnalysisSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialExtensions: string[];
  initialFolders: string[];
  onSave: (extensions: string[], folders: string[]) => void;
}

export function AnalysisSettingsDialog({
  isOpen,
  onClose,
  initialExtensions,
  initialFolders,
  onSave,
}: AnalysisSettingsDialogProps) {
  const { t } = useTranslation();
  const [extensionsText, setExtensionsText] = useState("");
  const [foldersText, setFoldersText] = useState("");

  useEffect(() => {
    if (isOpen) {
      setExtensionsText(initialExtensions.join(", "));
      setFoldersText((initialFolders || []).join(", "));
    }
  }, [isOpen, initialExtensions, initialFolders]);

  const handleSave = () => {
    const extensions = extensionsText
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean); 
    
    const folders = foldersText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    onSave([...new Set(extensions)], [...new Set(folders)]);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("analysisSettings.title")}</DialogTitle>
          <DialogDescription>
            {t("analysisSettings.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid w-full gap-1.5">
            <Label htmlFor="extensions">
              {t("analysisSettings.extensionsLabel")}
            </Label>
            <Input
              id="extensions"
              placeholder={t("analysisSettings.extensionsPlaceholder")}
              value={extensionsText}
              onChange={(e) => setExtensionsText(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("analysisSettings.extensionsHint")}
            </p>
          </div>
          <div className="grid w-full gap-1.5 mt-2">
            <Label htmlFor="folders">
              {t("analysisSettings.foldersLabel")}
            </Label>
            <Input
              id="folders"
              placeholder={t("analysisSettings.foldersPlaceholder")}
              value={foldersText}
              onChange={(e) => setFoldersText(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("analysisSettings.foldersHint")}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" onClick={handleSave}>
            {t("common.saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
