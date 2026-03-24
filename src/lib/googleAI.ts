// src/lib/googleAI.ts

import { type AppState, useAppStore } from "@/store/appStore";
import {
  type ChatMessage,
  type GenerationInfo,
  type ToolCall,
} from "@/store/types";
import { handleToolCalls } from "./openRouter";

type StoreApi = {
  getState: () => AppState;
  setState: (
    partial:
      | AppState
      | Partial<AppState>
      | ((state: AppState) => AppState | Partial<AppState>),
    replace?: false | undefined
  ) => void;
};

// Maps our ChatMessage role to Google's role
const toGoogleRole = (role: ChatMessage["role"]): "user" | "model" => {
  return role === "assistant" ? "model" : "user";
};

// Transforms our chat history and settings into Google's payload format
export const toGooglePayload = (
  messages: ChatMessage[],
  config: {
    systemPrompt?: string;
    temperature: number;
    topP: number;
    topK: number;
    maxTokens: number;
    thinkingLevel?: "MINIMAL" | "LOW" | "MEDIUM" | "HIGH";
    tools?: { function_declarations: any[] };
  }
) => {
  const contents = messages
    .filter(
      (msg) => msg.role !== "system" && (msg.content || msg.hiddenContent)
    )
    .map((msg) => ({
      role: toGoogleRole(msg.role),
      parts: [{ text: (msg.hiddenContent || "") + (msg.content || "") }],
    }));

  let system_instruction: { parts: { text: string }[] } | undefined = undefined;
  if (config.systemPrompt) {
    system_instruction = { parts: [{ text: config.systemPrompt }] };
  }

  const payload: Record<string, any> = {
    contents,
    system_instruction,
    generationConfig: {
      temperature: config.temperature,
      topP: config.topP,
      topK: config.topK > 0 ? config.topK : undefined,
      maxOutputTokens: config.maxTokens > 0 ? config.maxTokens : undefined,
      ...(config.thinkingLevel ? { thinkingConfig: { thinkingLevel: config.thinkingLevel } } : {})
    },
    tools: config.tools ? [config.tools] : undefined,
  };

  return payload;
};

/**
 * Handles a non-streaming response from Google Gemini.
 */
export const handleNonStreamingResponseGoogle = async (
  response: Response
): Promise<ChatMessage> => {
  const data = await response.json();
  if (!data.candidates || data.candidates.length === 0) {
    // This can happen if the content was blocked
    const blockReason = data.promptFeedback?.blockReason || "unknown";
    return {
      role: "assistant",
      content: `Response was blocked by the API. Reason: ${blockReason}`,
    };
  }
  const candidate = data.candidates[0];
  const usage = data.usageMetadata;

  const generationInfo: GenerationInfo | undefined = usage ? {
    tokens_prompt: usage.promptTokenCount || 0,
    tokens_completion: usage.candidatesTokenCount || 0,
    total_cost: 0, // Google pricing is complex, skip for now
  } : undefined;

  const assistantMessage: ChatMessage = {
    role: "assistant",
    content: "",
    ...(generationInfo && { generationInfo }),
  };

  const toolCallsToExecute: ToolCall[] = [];

  for (const part of candidate.content.parts) {
    if (part.functionCall) {
      const { name, args } = part.functionCall;
      toolCallsToExecute.push({
        id: `call_${Date.now()}_${Math.random().toString(36).substring(7)}`, // Google doesn't provide an ID
        type: "function",
        function: {
          name: name,
          arguments: JSON.stringify(args), // Gemini provides args as an object
        },
      });
    } else if (part.text) {
      assistantMessage.content += part.text;
    }
  }

  // Check for tool calls
  if (toolCallsToExecute.length > 0) {
    assistantMessage.tool_calls = toolCallsToExecute;
    assistantMessage.content = null; // As per OpenAI spec, content is null when tool_calls are present

    // Reuse existing tool handling logic
    await handleToolCalls(
      toolCallsToExecute,
      {
        getState: useAppStore.getState,
        setState: useAppStore.setState,
      },
      assistantMessage.generationInfo
    );
  }

  return assistantMessage;
};

/**
 * Handles a streaming response from Google Gemini.
 */
export const handleStreamingResponseGoogle = async (
  response: Response,
  storeApi: StoreApi
): Promise<void> => {
  if (!response.body) {
    throw new Error("Response body is null");
  }
  const { setState, getState } = storeApi;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let isFirstChunk = true;
  let finalUsage: GenerationInfo | null = null;
  let toolCallsToExecute: ToolCall[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const objectsToProcess = [];
    let lastProcessedIndex = 0;

    const findNextObjectStart = (startIndex: number) => {
      for (let i = startIndex; i < buffer.length; i++) {
        if (buffer[i] === "{") return i;
      }
      return -1;
    };

    let searchFrom = 0;
    while (searchFrom < buffer.length) {
      const start = findNextObjectStart(searchFrom);
      if (start === -1) break;

      let braceCount = 1;
      let end = -1;
      for (let i = start + 1; i < buffer.length; i++) {
        if (buffer[i] === "{") braceCount++;
        if (buffer[i] === "}") braceCount--;
        if (braceCount === 0) {
          end = i;
          break;
        }
      }

      if (end !== -1) {
        const objectStr = buffer.substring(start, end + 1);
        try {
          const parsedObject = JSON.parse(objectStr);
          objectsToProcess.push(parsedObject);
          searchFrom = end + 1;
          lastProcessedIndex = searchFrom;
        } catch (e) {
          searchFrom = start + 1;
        }
      } else {
        break;
      }
    }

    if (lastProcessedIndex > 0) {
      buffer = buffer.substring(lastProcessedIndex);
    }

    if (objectsToProcess.length > 0) {
      let combinedText = "";

      let chunkUsage: GenerationInfo | undefined;

      for (const chunk of objectsToProcess) {
        if (chunk.usageMetadata) {
          chunkUsage = {
            tokens_prompt: chunk.usageMetadata.promptTokenCount || 0,
            tokens_completion: chunk.usageMetadata.candidatesTokenCount || 0,
            total_cost: 0,
          };
          finalUsage = chunkUsage;
        }

        const parts = chunk?.candidates?.[0]?.content?.parts;
        if (!parts) continue;

        for (const part of parts) {
          if (part.functionCall) {
            const { name, args } = part.functionCall;
            toolCallsToExecute.push({
              id: `call_${Date.now()}_${Math.random().toString(36).substring(7)}`,
              type: "function",
              function: { name, arguments: JSON.stringify(args) },
            });
          } else if (part.text) {
            combinedText += part.text;
          }
        }
      }

      if (toolCallsToExecute.length > 0) {
        reader.cancel();
        await handleToolCalls(toolCallsToExecute, storeApi, chunkUsage || finalUsage || undefined);
        return;
      }

      if (combinedText) {
        if (isFirstChunk) {
          isFirstChunk = false;
          setState((state) => ({
            chatMessages: [
              ...state.chatMessages,
              {
                role: "assistant",
                content: combinedText,
                ...(finalUsage && { generationInfo: finalUsage }),
              },
            ],
          }));
        } else {
          setState((state) => {
            const lastMessage = state.chatMessages[state.chatMessages.length - 1];
            if (lastMessage && lastMessage.role === "assistant") {
              return {
                chatMessages: [
                  ...state.chatMessages.slice(0, -1),
                  {
                    ...lastMessage,
                    content: (lastMessage.content || "") + combinedText,
                    ...(finalUsage && { generationInfo: finalUsage }),
                  },
                ],
              };
            }
            return state;
          });
        }
      }
    }
  }

  if (toolCallsToExecute.length > 0) {
    await handleToolCalls(toolCallsToExecute, storeApi, finalUsage || undefined);
    return;
  }

  if (finalUsage) {
    const state = getState();
    const newMessages = [...state.chatMessages];
    const lastIndex = newMessages.length - 1;
    if (newMessages[lastIndex] && newMessages[lastIndex].role === "assistant") {
      newMessages[lastIndex] = { ...newMessages[lastIndex], generationInfo: finalUsage };
      setState({ chatMessages: newMessages });
      await getState().actions.saveCurrentChatSession(newMessages);
    }
  }
};
