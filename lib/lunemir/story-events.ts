import { createId } from "./defaults";
import type { StoryEvent, StoryEventType } from "./types";

export type PhoneMessageProposal = {
  shouldSend: boolean;
  content: string;
  reason: string;
};

const PHONE_EVENT_TYPES = new Set<StoryEventType>(["phone_message_received", "phone_message_sent"]);

function unwrapJson(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const firstLineEnd = trimmed.indexOf("\n");
  const closingFence = trimmed.lastIndexOf("```");
  if (firstLineEnd < 0 || closingFence <= firstLineEnd) throw new Error("手机事件提案不是有效的 JSON。");
  return trimmed.slice(firstLineEnd + 1, closingFence).trim();
}

export function parsePhoneMessageProposal(raw: string): PhoneMessageProposal {
  const parsed = JSON.parse(unwrapJson(raw)) as unknown;
  if (!parsed || typeof parsed !== "object") throw new Error("手机事件提案必须是 JSON 对象。");
  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.shouldSend !== "boolean") throw new Error("手机事件提案缺少 shouldSend。");
  const content = typeof candidate.content === "string" ? candidate.content.trim() : "";
  const reason = typeof candidate.reason === "string" ? candidate.reason.trim() : "";
  if (candidate.shouldSend && !content) throw new Error("手机事件提案缺少消息内容。");
  if (content.length > 600) throw new Error("手机消息不能超过 600 个字符。");
  return { shouldSend: candidate.shouldSend, content, reason };
}

export function createStoryEvent(input: {
  storyId: string;
  eventType: StoryEventType;
  actorId: string;
  targetId: string;
  content: string;
  source: StoryEvent["source"];
  replyToEventId?: string;
  storyTime?: string;
}): StoryEvent {
  const content = input.content.trim();
  const storyTime = input.storyTime ?? new Date().toISOString();
  const event: StoryEvent = {
    id: createId("event"),
    schemaVersion: 1,
    storyId: input.storyId.trim(),
    eventType: input.eventType,
    actorId: input.actorId.trim(),
    targetId: input.targetId.trim(),
    content,
    storyTime,
    source: input.source,
    status: "committed",
    createdAt: new Date().toISOString(),
    replyToEventId: input.replyToEventId,
  };
  validateStoryEvent(event);
  return event;
}

export function validateStoryEvent(event: StoryEvent) {
  if (!event.id || !event.storyId || !event.actorId || !event.targetId) throw new Error("剧情事件缺少必要标识。");
  if (!PHONE_EVENT_TYPES.has(event.eventType)) throw new Error("不支持的剧情事件类型。");
  if (!event.content || event.content.length > 600) throw new Error("剧情事件内容长度无效。");
  if (Number.isNaN(Date.parse(event.storyTime)) || Number.isNaN(Date.parse(event.createdAt))) throw new Error("剧情事件时间无效。");
  if (event.status !== "committed") throw new Error("只有已确认事件可以写入剧情状态。");
  return event;
}

export function isDuplicatePhoneEvent(events: StoryEvent[], candidate: StoryEvent) {
  const normalized = candidate.content.replaceAll(/\s+/g, " ").trim().toLocaleLowerCase();
  const threshold = Date.parse(candidate.createdAt) - 5 * 60 * 1000;
  return events.some((event) => event.storyId === candidate.storyId
    && event.eventType === candidate.eventType
    && event.actorId === candidate.actorId
    && event.content.replaceAll(/\s+/g, " ").trim().toLocaleLowerCase() === normalized
    && Date.parse(event.createdAt) >= threshold);
}
