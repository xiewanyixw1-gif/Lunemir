import { createId } from "./defaults";
import type { CharacterRecord, StoryEvent, StoryEventType, StoryState } from "./types";

export type PhoneMessageProposal = {
  shouldSend: boolean;
  content: string;
  reason: string;
  confidence: number;
};

const STORY_EVENT_TYPES = new Set<StoryEventType>(["phone_message_received", "phone_message_sent", "time_advanced", "story_state_changed"]);

export function createDefaultStoryState(character: CharacterRecord, initialTime = new Date().toISOString()): StoryState {
  const currentTime = Number.isNaN(Date.parse(initialTime)) ? new Date().toISOString() : initialTime;
  return {
    currentTime,
    location: "",
    weather: "",
    scene: character.scenario.trim(),
    npcInitiative: 65,
    cooldownMinutes: 120,
    updatedAt: currentTime,
  };
}

export function normalizeStoryState(value: StoryState | undefined, character: CharacterRecord, fallbackTime?: string): StoryState {
  const fallback = createDefaultStoryState(character, fallbackTime);
  const currentTime = value?.currentTime && !Number.isNaN(Date.parse(value.currentTime)) ? value.currentTime : fallback.currentTime;
  return {
    currentTime,
    location: value?.location?.trim() ?? fallback.location,
    weather: value?.weather?.trim() ?? fallback.weather,
    scene: value?.scene?.trim() ?? fallback.scene,
    npcInitiative: Math.min(100, Math.max(0, Number.isFinite(value?.npcInitiative) ? Number(value?.npcInitiative) : fallback.npcInitiative)),
    cooldownMinutes: Math.min(10080, Math.max(0, Number.isFinite(value?.cooldownMinutes) ? Number(value?.cooldownMinutes) : fallback.cooldownMinutes)),
    lastNpcActionAt: value?.lastNpcActionAt && !Number.isNaN(Date.parse(value.lastNpcActionAt)) ? value.lastNpcActionAt : undefined,
    updatedAt: value?.updatedAt && !Number.isNaN(Date.parse(value.updatedAt)) ? value.updatedAt : currentTime,
  };
}

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
  const confidence = typeof candidate.confidence === "number" && Number.isFinite(candidate.confidence)
    ? Math.min(100, Math.max(0, candidate.confidence))
    : candidate.shouldSend ? 100 : 0;
  if (candidate.shouldSend && !content) throw new Error("手机事件提案缺少消息内容。");
  if (content.length > 600) throw new Error("手机消息不能超过 600 个字符。");
  return { shouldSend: candidate.shouldSend, content, reason, confidence };
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
  metadata?: StoryEvent["metadata"];
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
    metadata: input.metadata,
  };
  validateStoryEvent(event);
  return event;
}

export function validateStoryEvent(event: StoryEvent) {
  if (!event.id || !event.storyId || !event.actorId || !event.targetId) throw new Error("剧情事件缺少必要标识。");
  if (!STORY_EVENT_TYPES.has(event.eventType)) throw new Error("不支持的剧情事件类型。");
  if (!event.content || event.content.length > 1200) throw new Error("剧情事件内容长度无效。");
  if (Number.isNaN(Date.parse(event.storyTime)) || Number.isNaN(Date.parse(event.createdAt))) throw new Error("剧情事件时间无效。");
  if (event.status !== "committed" && event.status !== "reverted") throw new Error("剧情事件状态无效。");
  return event;
}

export function isDuplicatePhoneEvent(events: StoryEvent[], candidate: StoryEvent) {
  const normalized = candidate.content.replaceAll(/\s+/g, " ").trim().toLocaleLowerCase();
  const threshold = Date.parse(candidate.createdAt) - 5 * 60 * 1000;
  return events.some((event) => event.storyId === candidate.storyId
    && event.status === "committed"
    && event.eventType === candidate.eventType
    && event.actorId === candidate.actorId
    && event.content.replaceAll(/\s+/g, " ").trim().toLocaleLowerCase() === normalized
    && Date.parse(event.createdAt) >= threshold);
}
