import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { useAppStore } from "@/store/appStore";

const normalize = (s: string) => s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const cleanTrailing = (s: string) => s.split('\n').map(line => line.trimEnd()).join('\n');

export function useSubAgentListener() {
  useEffect(() => {
    const unlistenPromise = listen<{ id: string; file: string; fileContent: string; failedSearch: string; failedReplace: string }>(
      "patch_needs_fix",
      async (event) => {
        const { id, file, fileContent, failedSearch, failedReplace } = event.payload;
        const state = useAppStore.getState();
        const { addPatchLog, addSubAgentLogToOperation } = state.actions;

        const logUI = (msg: string) => {
          addPatchLog(`[SUB-AGENT 🤖] ${msg}`);
          addSubAgentLogToOperation(id, msg);
        };

        if (!state.subAgentEnabled) {
          logUI(`⚠️ Tính năng Sub-Agent đã bị tắt trong Cài đặt. Bỏ qua block lỗi tại file: ${file}`);
          await invoke("submit_patch_fix", { search: null, replace: null });
          return;
        }

        try {
          const { openRouterApiKey, googleApiKey, nvidiaApiKey, subAgentModel, selectedAiModel, allAvailableModels, subAgentMaxRetries } = state;
          const targetModelId = subAgentModel || selectedAiModel;
          const model = allAvailableModels.find((m) => m.id === targetModelId);

          if (!model) throw new Error("Không có Model AI nào được cấu hình để Sub-Agent chạy.");

          const actualApiKey =
            model.provider === "google"
              ? googleApiKey
              : model.provider === "nvidia"
              ? nvidiaApiKey
              : openRouterApiKey;

          if (!actualApiKey) throw new Error("Chưa cung cấp API Key cho Sub-Agent.");

          logUI(`Khởi động Sub-Agent (${model.name})...`);

          let attempt = 0;
          let success = false;
          let chatHistory: any[] = [];

          const initialPrompt = `You are a strict, autonomous code-fixing agent.
I tried to apply a SEARCH/REPLACE block to a file, but the SEARCH block did not exactly match the file's current content (indentation or minor changes might exist).

FILE CONTENT:
\`\`\`
${fileContent}
\`\`\`

FAILED SEARCH BLOCK:
\`\`\`
${failedSearch}
\`\`\`

INTENDED REPLACE BLOCK:
\`\`\`
${failedReplace}
\`\`\`

YOUR TASK:
1. Locate the correct lines in the FILE CONTENT that correspond to the FAILED SEARCH BLOCK.
2. Output a NEW, perfectly matching SEARCH/REPLACE block that contains the exact lines from the FILE CONTENT in the SEARCH section, and the updated lines in the REPLACE section.
3. Output ONLY the block. Do not add any markdown formatting, no explanations, no yapping.

FORMAT REQUIRED:
<<<<<<< SEARCH
[exact matching lines from file]
=======
[new replaced lines]
>>>>>>> REPLACE`;

          chatHistory.push({ role: "user", content: initialPrompt });

          while (attempt < subAgentMaxRetries && !success) {
            attempt++;
            logUI(`Đang phân tích và sửa mã nguồn (Lần thử ${attempt}/${subAgentMaxRetries})...`);

            let fixResult = "";

            if (model.provider === "google") {
              const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent`;
              const response = await tauriFetch(endpoint, {
                method: "POST",
                headers: {
                  "x-goog-api-key": actualApiKey,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  contents: chatHistory.map(m => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] })),
                  generationConfig: { temperature: 0.1 },
                }),
              });
              const data = await response.json();
              fixResult = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
            } else {
              const endpoint =
                model.provider === "nvidia"
                  ? "https://integrate.api.nvidia.com/v1/chat/completions"
                  : "https://openrouter.ai/api/v1/chat/completions";
              const response = await tauriFetch(endpoint, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${actualApiKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: model.id,
                  messages: chatHistory,
                  temperature: 0.1,
                }),
              });
              const data = await response.json();
              fixResult = data.choices?.[0]?.message?.content || "";
            }

            chatHistory.push({ role: "assistant", content: fixResult });

            const cleanResult = fixResult.replace(/```[a-z]*\n/g, "").replace(/```/g, "");
            const searchMatch = cleanResult.match(/<<<<<<< SEARCH[\r\n]+([\s\S]*?)[\r\n]+=======/);
            const replaceMatch = cleanResult.match(/=======[\r\n]+([\s\S]*?)[\r\n]+>>>>>>> REPLACE/);

            if (searchMatch && replaceMatch) {
              const proposedSearch = searchMatch[1];
              const proposedReplace = replaceMatch[1];

              const cleanFileContent = cleanTrailing(normalize(fileContent));
              const cleanProposedSearch = cleanTrailing(normalize(proposedSearch));

              if (cleanFileContent.includes(cleanProposedSearch)) {
                success = true;
                logUI(`✅ Vá lỗi thành công! Cập nhật mã nguồn...`);
                await invoke("submit_patch_fix", {
                  search: proposedSearch,
                  replace: proposedReplace,
                });
                return;
              } else {
                logUI(`❌ Lần thử ${attempt} thất bại: Mã nguồn thay thế vẫn chưa khớp.`);
                chatHistory.push({ role: "user", content: "Your proposed SEARCH block STILL does not exactly match the FILE CONTENT. Please try again. Pay extremely close attention to indentation, blank lines, and brackets. Output ONLY the strict SEARCH/REPLACE block." });
              }
            } else {
              logUI(`❌ Lần thử ${attempt} thất bại: AI trả về sai cấu trúc format.`);
              chatHistory.push({ role: "user", content: "You did not output the proper <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE format. Try again and output ONLY the block." });
            }
          }

          if (!success) {
            logUI(`🚨 Đã thử tối đa (${subAgentMaxRetries} lần). Bỏ qua block này.`);
          }
          await invoke("submit_patch_fix", { search: null, replace: null });

        } catch (e) {
          console.error("Sub-Agent Error:", e);
          logUI(`🚨 Lỗi cấu hình / Gọi API Sub-Agent: ${String(e)}`);
          await invoke("submit_patch_fix", { search: null, replace: null });
        }
      }
    );

    return () => {
      unlistenPromise.then((f) => f());
    };
  }, []);
}
