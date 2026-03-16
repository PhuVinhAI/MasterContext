import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Loader2, RefreshCw, Terminal, Send } from "lucide-react";
import { type KiloModelInfo } from "@/store/types";
import { message } from "@tauri-apps/plugin-dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface KiloTabProps {
  kiloPort: number;
  selectedKiloModel: string;
  discordWebhookUrl: string;
  kiloAvailableModels: KiloModelInfo[];
  onRefreshModels: () => Promise<void>;
  onSave: (settings: { kiloPort: number; selectedKiloModel: string; discordWebhookUrl: string }) => Promise<void>;
}

export function KiloTab({
  kiloPort,
  selectedKiloModel,
  discordWebhookUrl,
  kiloAvailableModels,
  onRefreshModels,
  onSave,
}: KiloTabProps) {
  const { t } = useTranslation();
  const [localKiloPort, setLocalKiloPort] = useState(kiloPort);
  const [localKiloModel, setLocalKiloModel] = useState(selectedKiloModel);
  const [localDiscordUrl, setLocalDiscordUrl] = useState(discordWebhookUrl);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);

  useEffect(() => {
    setLocalKiloPort(kiloPort);
    setLocalKiloModel(selectedKiloModel);
    setLocalDiscordUrl(discordWebhookUrl);
  }, [kiloPort, selectedKiloModel, discordWebhookUrl]);

  const handleSave = async () => {
    setIsSaving(true);
    await onSave({
      kiloPort: localKiloPort,
      selectedKiloModel: localKiloModel,
      discordWebhookUrl: localDiscordUrl,
    });
    setIsSaving(false);
  };

  const handleRefreshModels = async () => {
    setIsRefreshing(true);
    await onRefreshModels();
    setIsRefreshing(false);
  };

  const handleTestWebhook = async () => {
    if (!localDiscordUrl) return;
    setIsTestingWebhook(true);
    try {
      const res = await fetch(localDiscordUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `@everyone 🔔 **Master Context**: Đây là tin nhắn kiểm tra cấu hình Webhook. Nếu bạn nhận được tin nhắn này, mọi thứ đã hoạt động tốt!\n*🕒 ${new Date().toLocaleString('vi-VN')} | ID: ${Math.random().toString(36).substring(7)}*`,
        }),
      });
      if (res.ok) {
        await message(t("settings.kilo.testWebhookSuccess"), { title: t("common.success"), kind: "info" });
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (e) {
      await message(t("settings.kilo.testWebhookError", { error: String(e) }), { title: t("common.error"), kind: "error" });
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const isChanged = localKiloPort !== kiloPort || localKiloModel !== selectedKiloModel || localDiscordUrl !== discordWebhookUrl;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Terminal className="h-5 w-5" /> {t("settings.kilo.title")}
        </h2>
        <Badge variant="outline" className="border-emerald-500 text-emerald-500">
          Agent
        </Badge>
      </div>

      <div className="space-y-4 rounded-lg border p-4">
        <div className="space-y-2">
          <Label htmlFor="kilo-port-input">{t("settings.kilo.port")}</Label>
          <Input
            id="kilo-port-input"
            type="number"
            value={localKiloPort}
            onChange={(e) => setLocalKiloPort(parseInt(e.target.value, 10) || 9999)}
            className="font-mono max-w-[200px]"
          />
          <p className="text-xs text-muted-foreground">{t("settings.kilo.description")}</p>
        </div>

        <div className="space-y-2 pt-4 border-t">
          <Label htmlFor="discord-webhook">{t("settings.kilo.discordWebhook")}</Label>
          <div className="flex gap-2">
            <Input
              id="discord-webhook"
              type="url"
              placeholder="https://discord.com/api/webhooks/..."
              value={localDiscordUrl}
              onChange={(e) => setLocalDiscordUrl(e.target.value)}
            />
            <Button
              variant="outline"
              onClick={handleTestWebhook}
              disabled={!localDiscordUrl || isTestingWebhook}
              title={t("settings.kilo.testWebhook")}
              className="shrink-0"
            >
              {isTestingWebhook ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="ml-2 hidden sm:inline">{t("settings.kilo.testWebhook")}</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("settings.kilo.discordWebhookDesc")}</p>
        </div>

        <div className="space-y-2 pt-4 border-t">
          <Label htmlFor="kilo-model-input">{t("settings.kilo.model")}</Label>
          <div className="flex gap-2">
            <Input
              id="kilo-model-input"
              type="text"
              placeholder="Ví dụ: kilo/minimax/minimax-m2.5:free"
              value={localKiloModel}
              onChange={(e) => setLocalKiloModel(e.target.value)}
              className="font-mono"
            />
            <Button
              variant="outline"
              onClick={handleRefreshModels}
              disabled={isRefreshing}
              title={t("settings.kilo.refreshModels")}
              className="shrink-0"
            >
              {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground pt-1">
            {t("settings.kilo.availableModels")}
          </p>

          <ScrollArea className="h-[200px] w-full rounded-md border p-2 mt-2 bg-muted/20">
            {kiloAvailableModels.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Nhấn tải lại để cập nhật danh sách
              </div>
            ) : (
              <div className="space-y-1">
                {kiloAvailableModels.map((model) => (
                  <div
                    key={model.id}
                    onClick={() => setLocalKiloModel(model.id)}
                    className="cursor-pointer text-xs font-mono p-2 rounded hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    {model.label}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <div className="pt-4 border-t">
          <Button
            onClick={handleSave}
            disabled={isSaving || !isChanged}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {t("common.saveChanges")}
          </Button>
        </div>
      </div>
    </div>
  );
}
