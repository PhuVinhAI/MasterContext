// src/components/GroupAIUpdateDialog.tsx
import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";

interface GroupAIUpdateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  groupName: string;
  onApply: (text: string) => void;
}

export function GroupAIUpdateDialog({
  isOpen,
  onClose,
  groupName,
  onApply,
}: GroupAIUpdateDialogProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");

  const handleApply = () => {
    onApply(text);
    setText("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("groupItem.aiUpdateDialog.title", { name: groupName })}</DialogTitle>
          <DialogDescription>
            {t("groupItem.aiUpdateDialog.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            placeholder={t("groupItem.aiUpdateDialog.placeholder")}
            className="min-h-[150px] max-h-[50vh] overflow-y-auto font-mono text-xs"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleApply} disabled={!text.trim()}>
            {t("groupItem.aiUpdateDialog.apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
