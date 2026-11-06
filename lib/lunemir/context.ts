import type {
  AuthorNote,
  CharacterRecord,
  CompiledContext,
  ContextSegment,
  LorebookEntry,
  MatchedLore,
  ModelMessage,
  PersonaRecord,
  PresetRecord,
  StoredMessage,
  StoryEvent,
  StoryState,
  StorySummary,
} from "./types";
import { replaceRoleMacros } from "./macros";

export type ContextOptions = {
  persona?: PersonaRecord | null;
  preset?: PresetRecord | null;
  externalLoreEntries?: LorebookEntry[];
  memories?: string[];
  storyEvents?: StoryEvent[];
  authorNote?: AuthorNote;
  storySummary?: StorySummary;
  storyState?: StoryState;
};

export function estimateTokens(text: string) {
  const cjk = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const other = Math.max(0, text.length - cjk);
  return Math.max(1, Math.ceil(cjk * 1.15 + other / 4));
}

export function resolvePresetPrompts(preset?: PresetRecord | null) {
  if (!preset) return { systemPrompt: "", postHistoryInstructions: "", activeModuleCount: 0, activeModules: [] };
  if (!Array.isArray(preset.modules)) {
    const activeModules = [
      ...(preset.systemPrompt.trim() ? [{ id: "legacy-system", name: "System Prompt", content: preset.systemPrompt, enabled: true, position: "system" as const, priority: 100, order: 0 }] : []),
      ...(preset.postHistoryInstructions.trim() ? [{ id: "legacy-post-history", name: "Post-History Instructions", content: preset.postHistoryInstructions, enabled: true, position: "post_history" as const, priority: 100, order: 1 }] : []),
    ];
    return {
      systemPrompt: preset.systemPrompt,
      postHistoryInstructions: preset.postHistoryInstructions,
      activeModuleCount: activeModules.length,
      activeModules,
    };
  }
  const activeModules = preset.modules
    .filter((module) => module.enabled && module.content.trim())
    .sort((left, right) => right.priority - left.priority || left.order - right.order);
  return {
    systemPrompt: activeModules.filter((module) => module.position === "system").map((module) => module.content).join("\n\n"),
    postHistoryInstructions: activeModules.filter((module) => module.position === "post_history").map((module) => module.content).join("\n\n"),
    activeModuleCount: activeModules.length,
    activeModules,
  };
}

function deterministicPercent(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (Math.abs(hash) % 100) + 1;
}

function truncateToTokenBudget(content: string, budget: number) {
  if (budget <= 0 || estimateTokens(content) <= budget) return content;
  let start = 0;
  let end = content.length;
  while (start < end) {
    const middle = Math.ceil((start + end) / 2);
    if (estimateTokens(content.slice(0, middle)) <= budget) start = middle;
    else end = middle - 1;
  }
  return `${content.slice(0, start).trimEnd()}\n[…已按条目预算截断]`;
}

function matchesLore(entries: LorebookEntry[], messageContents: string[], phoneText: string): MatchedLore[] {
  const candidates = entries
    .filter((entry) => entry.enabled)
    .sort((left, right) => right.priority - left.priority || left.insertionOrder - right.insertionOrder);
  const matched: MatchedLore[] = [];
  const matchedIds = new Set<string>();

  for (let pass = 0; pass < 3; pass += 1) {
    let added = false;
    for (const entry of candidates) {
      if (matchedIds.has(entry.id)) continue;
      const depth = Math.min(100, Math.max(1, entry.scanDepth ?? 12));
      const recursiveText = entry.recursive ? matched.map((match) => match.content).join("\n") : "";
      const transcript = [messageContents.slice(-depth).join("\n"), phoneText, recursiveText].filter(Boolean).join("\n");
      const haystack = entry.caseSensitive ? transcript : transcript.toLocaleLowerCase();
      const primaryKeys = entry.caseSensitive ? entry.keys : entry.keys.map((key) => key.toLocaleLowerCase());
      const primaryMatch = entry.constant || primaryKeys.some((key) => key && haystack.includes(key));
      if (!primaryMatch) continue;
      if (entry.selective && entry.secondaryKeys.length > 0) {
        const secondaryKeys = entry.caseSensitive ? entry.secondaryKeys : entry.secondaryKeys.map((key) => key.toLocaleLowerCase());
        if (!secondaryKeys.some((key) => key && haystack.includes(key))) continue;
      }
      const probability = Math.min(100, Math.max(0, entry.probability ?? 100));
      if (entry.useProbability && deterministicPercent(`${entry.id}:${transcript}`) > probability) continue;
      const content = truncateToTokenBudget(entry.content, Math.max(0, entry.tokenBudget ?? 0));
      const trigger = entry.constant ? "常驻条目" : entry.recursive && pass > 0 ? "递归关键词触发" : `关键词：${entry.keys.slice(0, 3).join("、")}`;
      matched.push({ entry, content, reason: `${trigger}${entry.useProbability ? ` · ${probability}%` : ""}` });
      matchedIds.add(entry.id);
      added = true;
    }
    if (!added) break;
  }
  return matched;
}

export function compileContext(
  character: CharacterRecord,
  messages: StoredMessage[],
  contextLimit: number,
  options: ContextOptions = {},
): CompiledContext {
  const persona = options.persona;
  const preset = options.preset;
  const replaceMacros = (value: string) => replaceRoleMacros(value, character.name, persona?.name || "用户");
  const phoneEvents = (options.storyEvents ?? [])
    .filter((event) => event.status === "committed" && (event.eventType === "phone_message_received" || event.eventType === "phone_message_sent"))
    .slice(-12);
  const phoneText = phoneEvents.map((event) => {
    const sender = event.actorId === character.id ? character.name : persona?.name || "用户";
    const receiver = event.targetId === character.id ? character.name : persona?.name || "用户";
    return `[${new Date(event.storyTime).toLocaleString("zh-CN")} · 手机] ${sender} → ${receiver}：${replaceMacros(event.content)}`;
  }).join("\n");
  const allLoreEntries = [...character.lorebookEntries, ...(options.externalLoreEntries ?? [])];
  const matchedLore = matchesLore(allLoreEntries, messages.map((message) => replaceMacros(message.content)), phoneText);
  const characterDefinition = [
    `你正在扮演 ${character.name}。`,
    character.description,
    character.personality && `性格：${character.personality}`,
    character.scenario && `当前场景：${character.scenario}`,
    character.systemPrompt,
  ].filter(Boolean).map(replaceMacros).join("\n\n");
  const personaDefinition = persona
    ? [
        `与您互动的用户人设是 ${persona.name}。`,
        persona.description,
        persona.identity && `身份：${persona.identity}`,
        persona.occupation && `职业：${persona.occupation}`,
        persona.appearance && `外貌：${persona.appearance}`,
        persona.personality && `性格：${persona.personality}`,
        persona.background && `背景：${persona.background}`,
        persona.relationships && `人物关系：${persona.relationships}`,
        persona.currentState && `当前状态：${persona.currentState}`,
        persona.notes && `专属设定：${persona.notes}`,
      ].filter(Boolean).map((value) => replaceMacros(value ?? "")).join("\n")
    : "";
  const resolvedPreset = resolvePresetPrompts(preset);
  const presetPrompt = replaceMacros(resolvedPreset.systemPrompt);
  const presetPostHistory = replaceMacros(resolvedPreset.postHistoryInstructions);
  const loreText = matchedLore.map(({ entry, content }) => `[${entry.name}]\n${replaceMacros(content)}`).join("\n\n");
  const memoryText = (options.memories ?? []).filter(Boolean).map((memory) => `- ${replaceMacros(memory)}`).join("\n");
  const summaryText = options.storySummary?.status === "confirmed" ? replaceMacros(options.storySummary.content.trim()) : "";
  const authorNoteActive = Boolean(
    options.authorNote?.enabled
    && options.authorNote.content.trim()
    && (options.authorNote.expiresAfterMessageCount === undefined || messages.length < options.authorNote.expiresAfterMessageCount),
  );
  const authorNoteText = authorNoteActive ? replaceMacros(options.authorNote?.content.trim() ?? "") : "";
  const storyStateText = options.storyState
    ? [
        `当前剧情时间：${new Date(options.storyState.currentTime).toLocaleString("zh-CN")}`,
        options.storyState.location && `当前地点：${options.storyState.location}`,
        options.storyState.scene && `当前场景：${options.storyState.scene}`,
      ].filter(Boolean).join("\n")
    : "";
  const postHistory = [presetPostHistory, character.postHistoryInstructions, options.authorNote?.position === "post_history" ? authorNoteText : ""]
    .filter(Boolean)
    .map((value) => replaceMacros(value ?? ""))
    .join("\n\n");
  const systemContent = [presetPrompt, characterDefinition, personaDefinition, storyStateText && `统一剧情状态：\n${storyStateText}\n主聊天与手机事件必须使用这一时间、地点和场景，不得自行制造冲突。`, summaryText && `已经确认的剧情摘要：\n${summaryText}`, loreText && `相关世界设定：\n${loreText}`, memoryText && `已经确认的长期记忆：\n${memoryText}`, phoneText && `同一剧情中已确认的手机通信事件：\n${phoneText}\n这些事件已经真实发生，继续剧情时必须保持一致。`, options.authorNote?.position === "system" ? authorNoteText && `作者注释：\n${authorNoteText}` : ""]
    .filter(Boolean)
    .join("\n\n---\n\n");
  const coveredMessageCount = summaryText ? Math.min(messages.length, options.storySummary?.coveredMessageCount ?? 0) : 0;
  const historySource = messages
    .slice(coveredMessageCount)
    .filter((message) => message.content.trim())
    .slice(-40);
  const historyText = historySource.map((message) => replaceMacros(message.content)).join("\n");

  const segments: ContextSegment[] = [
    {
      id: "character",
      label: "角色定义",
      detail: `${character.name} · ${character.spec.toUpperCase()}`,
      estimatedTokens: estimateTokens(characterDefinition),
    },
    ...(personaDefinition ? [{
      id: "persona",
      label: "用户人设",
      detail: persona?.name ?? "用户",
      estimatedTokens: estimateTokens(personaDefinition),
    }] : []),
    ...(presetPrompt || presetPostHistory ? [{
      id: "preset",
      label: "提示词预设",
      detail: `${preset?.name ?? "Preset"} · ${resolvedPreset.activeModuleCount} 个模块`,
      estimatedTokens: estimateTokens([presetPrompt, presetPostHistory].filter(Boolean).join("\n\n")),
    }] : []),
    ...(loreText ? [{
      id: "lore",
      label: "世界书命中",
      detail: `${matchedLore.length} 个条目`,
      estimatedTokens: estimateTokens(loreText),
    }] : []),
    ...(memoryText ? [{
      id: "memory",
      label: "长期记忆",
      detail: `${options.memories?.length ?? 0} 条已确认`,
      estimatedTokens: estimateTokens(memoryText),
    }] : []),
    ...(summaryText ? [{
      id: "story-summary",
      label: "剧情摘要",
      detail: `覆盖 ${options.storySummary?.coveredMessageCount ?? 0} 条消息`,
      estimatedTokens: estimateTokens(summaryText),
    }] : []),
    ...(authorNoteText ? [{
      id: "author-note",
      label: "作者注释",
      detail: options.authorNote?.position === "system" ? "系统层" : options.authorNote?.position === "in_history" ? `历史深度 ${options.authorNote.depth}` : "历史后置",
      estimatedTokens: estimateTokens(authorNoteText),
    }] : []),
    ...(phoneText ? [{
      id: "phone-events",
      label: "手机联动",
      detail: `${phoneEvents.length} 条已确认事件`,
      estimatedTokens: estimateTokens(phoneText),
    }] : []),
    ...(storyStateText ? [{
      id: "story-state",
      label: "剧情状态",
      detail: options.storyState?.location || new Date(options.storyState?.currentTime ?? "").toLocaleString("zh-CN"),
      estimatedTokens: estimateTokens(storyStateText),
    }] : []),
    {
      id: "history",
      label: "最近对话",
      detail: `${historySource.length} 条未摘要消息`,
      estimatedTokens: estimateTokens(historyText),
    },
  ];

  const historyMessages: ModelMessage[] = historySource.map((message) => ({ role: message.role, content: replaceMacros(message.content) }));
  if (authorNoteText && options.authorNote?.position === "in_history") {
    const insertionIndex = Math.max(0, historyMessages.length - Math.max(0, options.authorNote.depth));
    historyMessages.splice(insertionIndex, 0, { role: "system", content: `作者注释：\n${authorNoteText}` });
  }
  const modelMessages: ModelMessage[] = [{ role: "system", content: systemContent }, ...historyMessages, ...(postHistory ? [{ role: "system" as const, content: postHistory }] : [])];
  const estimatedTokens = modelMessages.reduce((total, message) => total + estimateTokens(message.content), 0);
  const promptMessages = modelMessages.map((message, index) => ({
    id: `${message.role}-${index}`,
    role: message.role,
    label: index === 0
      ? "系统上下文"
      : postHistory && index === modelMessages.length - 1
        ? "历史后置指令"
        : message.role === "system"
          ? "作者注释"
          : message.role === "assistant"
          ? `${character.name} 的回复`
          : `${persona?.name ?? "用户"} 的消息`,
    content: message.content,
    estimatedTokens: estimateTokens(message.content),
  }));
  const usage = estimatedTokens / Math.max(1, contextLimit);
  const warnings = usage > 0.9
    ? ["上下文接近模型上限，较早消息可能需要摘要。"]
    : usage > 0.72
      ? ["上下文使用量较高。"]
      : [];

  return {
    messages: modelMessages,
    report: {
      estimatedTokens,
      limit: contextLimit,
      health: Math.max(8, Math.round(100 - usage * 100)),
      segments,
      matchedLore,
      loreStats: {
        total: allLoreEntries.length,
        enabled: allLoreEntries.filter((entry) => entry.enabled).length,
        matched: matchedLore.length,
      },
      presetModules: resolvedPreset.activeModules.map((module) => ({
        id: module.id,
        name: module.name,
        position: module.position,
        priority: module.priority,
        estimatedTokens: estimateTokens(replaceMacros(module.content)),
      })),
      promptMessages,
      warnings,
    },
  };
}
