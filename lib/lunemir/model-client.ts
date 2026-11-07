import type { GeneratedImage, ImageModelConfig, ModelConfig, ModelMessage } from "./types";

export function normalizeBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("请填写 API 地址。");
  const url = new URL(trimmed);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("API 地址必须使用 HTTP 或 HTTPS。");
  return url.toString().replace(/\/$/, "");
}

export function resolveApiEndpoint(baseUrl: string, path: string) {
  const explicitPath = path.trim();
  if (/^https?:\/\//i.test(explicitPath)) return normalizeBaseUrl(explicitPath);
  const url = new URL(normalizeBaseUrl(baseUrl));
  const cleanedPath = url.pathname
    .replace(/\/(?:chat\/completions|models|images\/generations)\/?$/i, "")
    .replace(/\/+$/, "");
  const suffix = (explicitPath || "/models").replace(/^\/+/, "");
  url.pathname = `${cleanedPath}/${suffix}`.replace(/\/{2,}/g, "/");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function requestHeaders(apiKey: string, jsonBody = false) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (jsonBody) headers["Content-Type"] = "application/json";
  if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
  return headers;
}

function readModelIds(payload: unknown) {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const nested = root.result && typeof root.result === "object" ? root.result as Record<string, unknown> : {};
  const candidates = Array.isArray(payload)
    ? payload
    : [root.data, root.models, root.items, nested.data, nested.models].find(Array.isArray) ?? [];
  return [...new Set((candidates as unknown[]).map((item) => {
    if (typeof item === "string") return item.trim();
    if (!item || typeof item !== "object") return "";
    const value = item as Record<string, unknown>;
    return [value.id, value.model, value.name].find((entry) => typeof entry === "string")?.toString().trim() ?? "";
  }).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

export async function testModelConnection(config: Pick<ModelConfig, "baseUrl" | "modelsPath"> | Pick<ImageModelConfig, "baseUrl" | "modelsPath">, apiKey: string) {
  let response: Response;
  try {
    response = await fetch(resolveApiEndpoint(config.baseUrl, config.modelsPath), {
      method: "GET",
      headers: requestHeaders(apiKey),
    });
  } catch {
    throw new Error("无法访问模型列表。请检查 API 地址、网络以及服务是否允许浏览器 CORS 跨域请求。");
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`读取模型失败（${response.status}）：${detail.slice(0, 180) || response.statusText}`);
  }
  const models = readModelIds(await response.json() as unknown);
  if (models.length === 0) throw new Error("接口已连接，但返回内容中没有可识别的模型 ID；可以手动填写模型，或修改模型列表端点。");
  return models;
}

function extractDelta(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const choice = choices[0] as { delta?: { content?: unknown }; message?: { content?: unknown }; text?: unknown };
  if (typeof choice.delta?.content === "string") return choice.delta.content;
  if (typeof choice.message?.content === "string") return choice.message.content;
  if (typeof choice.text === "string") return choice.text;
  return "";
}

export async function streamChatCompletion(options: {
  config: ModelConfig;
  apiKey: string;
  messages: ModelMessage[];
  signal: AbortSignal;
  onDelta: (text: string) => void;
}) {
  const { config, apiKey, messages, signal, onDelta } = options;
  if (!config.model.trim()) throw new Error("请填写模型 ID。");

  const response = await fetch(resolveApiEndpoint(config.baseUrl, config.chatCompletionsPath), {
    method: "POST",
    headers: requestHeaders(apiKey, true),
    signal,
    body: JSON.stringify({
      model: config.model.trim(),
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: true,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`模型请求失败（${response.status}）：${detail.slice(0, 240) || response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream") || !response.body) {
    const payload = await response.json() as unknown;
    const content = extractDelta(payload);
    if (!content) throw new Error("模型返回了无法识别的响应格式。");
    onDelta(content);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const delta = extractDelta(JSON.parse(data));
        if (delta) onDelta(delta);
      } catch {
        // Some compatible endpoints emit keepalive or non-JSON data lines.
      }
    }
  }
}

export async function generateChatCompletion(options: {
  config: ModelConfig;
  apiKey: string;
  messages: ModelMessage[];
  signal: AbortSignal;
  maxTokens?: number;
  temperature?: number;
}) {
  const { config, apiKey, messages, signal } = options;
  if (!config.model.trim()) throw new Error("请填写模型 ID。");
  const response = await fetch(resolveApiEndpoint(config.baseUrl, config.chatCompletionsPath), {
    method: "POST",
    headers: requestHeaders(apiKey, true),
    signal,
    body: JSON.stringify({
      model: config.model.trim(),
      messages,
      temperature: options.temperature ?? Math.min(config.temperature, 0.75),
      max_tokens: options.maxTokens ?? Math.min(config.maxTokens, 240),
      stream: false,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`模型请求失败（${response.status}）：${detail.slice(0, 240) || response.statusText}`);
  }
  const content = extractDelta(await response.json() as unknown);
  if (!content.trim()) throw new Error("模型没有返回结构化事件提案。");
  return content.trim();
}

export async function generateImage(options: {
  config: ImageModelConfig;
  apiKey: string;
  prompt: string;
  signal?: AbortSignal;
}): Promise<GeneratedImage> {
  const { config, apiKey, signal } = options;
  const prompt = options.prompt.trim();
  if (!prompt) throw new Error("请填写生图提示词。");
  if (!config.model.trim()) throw new Error("请填写生图模型 ID。");
  let response: Response;
  try {
    response = await fetch(resolveApiEndpoint(config.baseUrl, config.generationsPath), {
      method: "POST",
      headers: requestHeaders(apiKey, true),
      signal,
      body: JSON.stringify({
        model: config.model.trim(),
        prompt,
        n: 1,
        size: config.size || undefined,
        quality: config.quality || undefined,
        style: config.style || undefined,
      }),
    });
  } catch {
    throw new Error("无法访问生图接口。请检查 API 地址、网络以及服务是否允许浏览器 CORS 跨域请求。");
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`生图失败（${response.status}）：${detail.slice(0, 240) || response.statusText}`);
  }
  const payload = await response.json() as Record<string, unknown>;
  const candidates = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.images)
      ? payload.images
      : Array.isArray(payload.output)
        ? payload.output
        : [];
  const first = candidates[0];
  if (typeof first === "string") return { imageUrl: first };
  if (first && typeof first === "object") {
    const image = first as Record<string, unknown>;
    const url = [image.url, image.image_url].find((value) => typeof value === "string") as string | undefined;
    const base64 = [image.b64_json, image.base64].find((value) => typeof value === "string") as string | undefined;
    const revisedPrompt = typeof image.revised_prompt === "string" ? image.revised_prompt : undefined;
    if (url) return { imageUrl: url, revisedPrompt };
    if (base64) return { imageUrl: `data:image/png;base64,${base64}`, revisedPrompt };
  }
  throw new Error("生图接口已响应，但没有返回可识别的图片 URL 或 Base64 数据。");
}
