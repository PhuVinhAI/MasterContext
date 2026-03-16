import { type AIModel } from "@/store/types";

export const googleModels: AIModel[] = [
  {
    provider: "google",
    id: "gemini-3-flash-preview",
    name: "Gemini 3 Flash Preview",
    context_length: 1048576,
    pricing: { prompt: "0", completion: "0" },
  },
  {
    provider: "google",
    id: "gemini-3.1-flash-lite-preview",
    name: "Gemini 3.1 Flash Lite Preview",
    context_length: 1048576,
    pricing: { prompt: "0", completion: "0" },
  },
  {
    provider: "google",
    id: "gemini-robotics-er-1.5-preview",
    name: "Gemini Robotics ER 1.5 Preview",
    context_length: 1048576,
    pricing: { prompt: "0", completion: "0" },
  },
  {
    provider: "google",
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    context_length: 1048576,
    pricing: { prompt: "0", completion: "0" },
  },
  {
    provider: "google",
    id: "gemini-2.0-flash-lite",
    name: "Gemini 2.0 Flash Lite",
    context_length: 1048576,
    pricing: { prompt: "0", completion: "0" },
  },
];

export const nvidiaModels: AIModel[] = [
  {
    provider: "nvidia",
    id: "stepfun-ai/step-3.5-flash",
    name: "Step 3.5 Flash (NVIDIA)",
    context_length: 256000,
    pricing: { prompt: "0", completion: "0" },
  },
  {
    provider: "nvidia",
    id: "minimaxai/minimax-m2.5",
    name: "MiniMax m2.5 (NVIDIA)",
    context_length: 196608,
    pricing: { prompt: "0", completion: "0" },
  },
  {
    provider: "nvidia",
    id: "z-ai/glm5",
    name: "GLM5 (NVIDIA)",
    context_length: 202752,
    pricing: { prompt: "0", completion: "0" },
  },
  {
    provider: "nvidia",
    id: "moonshotai/kimi-k2.5",
    name: "Kimi k2.5 (NVIDIA)",
    context_length: 262144,
    pricing: { prompt: "0", completion: "0" },
  },
  {
    provider: "nvidia",
    id: "deepseek-ai/deepseek-v3.2",
    name: "DeepSeek v3.2 (NVIDIA)",
    context_length: 163840,
    pricing: { prompt: "0", completion: "0" },
  },
  {
    provider: "nvidia",
    id: "nvidia/nemotron-3-super-120b-a12b",
    name: "Nemotron 3 Super 120B (NVIDIA)",
    context_length: 262144,
    pricing: { prompt: "0", completion: "0" },
  },
];
