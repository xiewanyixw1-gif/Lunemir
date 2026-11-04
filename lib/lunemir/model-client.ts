import type { ModelConfig, ModelMessage } from "./types";

export function normalizeBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("请填写 API 地址。");
  const url = new URL(trimmed);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("API 地址必须使用 HTTP 或 HTTPS。");
  return url.toString().replace(/\/$/, "");
}

function endpoint(baseUrl: string, path: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.endsWith(path)) return normalized;
  return `${normalized}${path}`;
}

function requestHeaders(apiKey: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
  return headers;
}

export async function testModelConnection(config: ModelConfig, apiKey: string) {
  const response = await fetch(endpoint(config.baseUrl, "/models"), {
    headers: requestHeaders(apiKey),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`连接失败（${response.status}）：${detail.slice(0, 180) || response.statusText}`);
  }
  const payload = await response.json() as { data?: Array<{ id?: string }> };
  return payload.data?.map((model) => model.id).filter((id): id is string => Boolean(id)) ?? [];
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

  const response = await fetch(endpoint(config.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: requestHeaders(apiKey),
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
