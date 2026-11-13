import type {
  AuthorNote,
  CharacterRecord,
  CompiledContext,
  ContextSegment,
  LorebookEntry,
  MatchedLore,
  ModelMessage,
  PersonaRecord,
  PromptModule,
  PresetRecord,
  StoredMessage,
  StoryEvent,
  StoryState,
  StorySummary,
} from "./types";
import { replaceRandomMacros, replaceRoleMacros } from "./macros";
import { applyPromptFilters, normalizeOutputRenderer, presetUsesCustomPresentation, resolveOutputRendererConfig } from "./output-renderer";
import { restorePresetStructureMarkers } from "./preset";

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

export function resolvePresetPrompts(preset?: PresetRecord | null): {
  systemPrompt: string;
  postHistoryInstructions: string;
  activeModuleCount: number;
  activeModules: PromptModule[];
} {
  if (!preset) return { systemPrompt: "", postHistoryInstructions: "", activeModuleCount: 0, activeModules: [] };
  if (!Array.isArray(preset.modules)) {
    const activeModules: PromptModule[] = [
      ...(preset.systemPrompt.trim() ? [{ id: "legacy-system", name: "System Prompt", content: preset.systemPrompt, enabled: true, position: "system" as const, role: "system" as const, priority: 100, order: 0 }] : []),
      ...(preset.postHistoryInstructions.trim() ? [{ id: "legacy-post-history", name: "Post-History Instructions", content: preset.postHistoryInstructions, enabled: true, position: "post_history" as const, role: "system" as const, priority: 100, order: 1 }] : []),
    ];
    return {
      systemPrompt: preset.systemPrompt,
      postHistoryInstructions: preset.postHistoryInstructions,
      activeModuleCount: activeModules.length,
      activeModules,
    };
  }
  const activeModules = restorePresetStructureMarkers(preset)
    .filter((module) => module.enabled && (module.marker || module.content.trim()))
    .sort((left, right) => left.order - right.order || right.priority - left.priority);
  return {
    systemPrompt: activeModules.filter((module) => !module.marker && module.position === "system" && (module.role ?? "system") === "system").map((module) => module.content).join("\n\n"),
    postHistoryInstructions: activeModules.filter((module) => !module.marker && module.position === "post_history" && (module.role ?? "system") === "system").map((module) => module.content).join("\n\n"),
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
  const promptSeed = `${character.id}:${persona?.id ?? "default"}:${messages.at(-1)?.id ?? "opening"}:${messages.length}`;
  const replaceMacros = (value: string) => replaceRandomMacros(
    replaceRoleMacros(value, character.name, persona?.name || "用户"),
    promptSeed,
  );
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
  const formatLore = (entries: MatchedLore[]) => entries
    .map(({ entry, content }) => `[${entry.name}]\n${replaceMacros(content)}`)
    .join("\n\n");
  const loreBefore = matchedLore.filter(({ entry }) => entry.insertionPosition === "before_character");
  const loreInHistory = matchedLore.filter(({ entry }) => entry.insertionPosition === "in_history");
  const loreAfter = matchedLore.filter(({ entry }) => entry.insertionPosition !== "before_character" && entry.insertionPosition !== "in_history");
  const loreBeforeText = formatLore(loreBefore);
  const loreAfterText = formatLore(loreAfter);
  const loreText = formatLore(matchedLore);
  const characterDescription = [
    `你正在扮演 ${character.name}。`,
    character.description,
    character.systemPrompt,
  ].filter(Boolean).map(replaceMacros).join("\n\n");
  const characterPersonality = character.personality ? replaceMacros(`性格：${character.personality}`) : "";
  const scenarioText = character.scenario ? replaceMacros(`当前场景：${character.scenario}`) : "";
  const dialogueExamples = replaceMacros(character.exampleMessages);
  const characterDefinition = [characterDescription, characterPersonality, scenarioText].filter(Boolean).join("\n\n");
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
  const presetRoleMessages = resolvedPreset.activeModules
    .filter((module) => !module.marker && module.position === "system" && (module.role ?? "system") !== "system")
    .map((module) => ({ role: module.role as "user" | "assistant", content: replaceMacros(module.content) }));
  const presetPostRoleMessages = resolvedPreset.activeModules
    .filter((module) => !module.marker && module.position === "post_history" && (module.role ?? "system") !== "system")
    .map((module) => ({ role: module.role as "user" | "assistant", content: replaceMacros(module.content) }));
  const resolvedOutputRenderer = resolveOutputRendererConfig(
    preset?.outputRenderer,
    character.extensions,
    character.embeddedRendererEnabled !== false,
  );
  const rendererConfig = resolvedOutputRenderer ?? normalizeOutputRenderer(preset?.outputRenderer);
  const presentationPromptSource = `${resolvedPreset.activeModules.map((module) => module.content).join("\n")}\n${character.systemPrompt}\n${loreText}`;
  const hasCustomPresentation = presetUsesCustomPresentation(
    rendererConfig,
    presentationPromptSource,
  );
  const rendererProvidesTemplate = presetUsesCustomPresentation(rendererConfig);
  const interactiveTheaterRequested = /<script\b|\son[a-z]+\s*=|\bdata-(?:tab|target|action)\s*=|(?:交互|切换).{0,20}(?:按钮|标签|页面|面板)|(?:按钮|标签|页面|面板).{0,20}(?:交互|切换)/i
    .test(presentationPromptSource);
  const nativeWidgetRequested = /:::status\b|:::widget\b|<lunemir-(?:status|widget)\b|\[(?:UI_PANEL|STATUS_PANEL)\]/i
    .test(presentationPromptSource);
  const snowTheaterRequested = /<snow(?:\s|>)|<snow_rules\b/i
    .test(presentationPromptSource);
  const outputProtocol = rendererProvidesTemplate
    ? `输出呈现规则：当前角色卡或预设已经带有专属的状态栏/Regex 后处理器。主状态栏只输出它要求的动态字段、占位标记和剧情正文；CSS、<style>、完整 HTML 模板与样式说明由后处理器负责，禁止在回复中复述、解释或改写。不要额外输出 Lunemir 的 :::status / :::widget，也不要再生成第二套状态栏。正文必须保持正常段落结构，并放在专属模板规定的正文区域。若旧模板原本依赖脚本填充，请保留模板要求的最终状态键值，不得只留下“正在渲染/加载”等等待文案。除世界书明确要求的独立小剧场外，不要额外生成 JavaScript、事件处理器、表单或外部网络资源。`
    : hasCustomPresentation
      ? `输出呈现规则：当前角色卡、预设或已命中的世界书定义了专属状态栏或 HTML/CSS 格式，但没有可复用的 Regex 模板。严格按原规则输出一次完整结构，不要改写成 Lunemir 的 :::status / :::widget，也不要生成第二套状态栏。需要的 <style> 可随 HTML 输出一次，不要把 CSS 当作解释性正文，不要用 Markdown 代码围栏包裹 HTML。小说正文保持正常段落和空行，并放入模板指定的 content、正文或主内容区域。不要留下“正在渲染/加载”等占位文案。${interactiveTheaterRequested ? "规则明确要求交互时，可以在该独立组件内部输出自包含的内联 JavaScript 或事件处理器；脚本只能操作本组件 DOM，不得访问父页面、网络、存储、表单提交或外部库，并且初始画面在脚本失败时仍必须完整可读。" : "当前规则未要求交互，不要额外输出 JavaScript、事件处理器、表单或外部网络资源。"}`
    : nativeWidgetRequested && rendererConfig.widgets
      ? `Lunemir 原生组件回退协议：只有当当前预设明确要求状态栏或小组件、但没有规定自己的输出模板时，才使用下面的纯文本格式：
:::status 状态栏标题
时间：当前剧情时间
地点：当前地点
情绪：角色当前情绪
:::
其他键值组件可使用 :::widget 标题 开始，并用 ::: 结束。正文仍写在组件之外。角色卡或预设没有要求组件时，不要额外生成状态栏。`
        : "";
  const snowTheaterProtocol = snowTheaterRequested
    ? `Lunemir 小剧场兼容协议：严格遵守已启用世界书小剧场规则规定的 <snow>、<details>、<summary> 与内容顺序。若规则要求 HTML fenced block，必须把完整 HTML/CSS 放在该围栏内；若规则要求纯文字，则不要擅自添加代码。不要把 CSS、标签说明或设计过程散落到小说正文中。${interactiveTheaterRequested ? "规则明确要求交互时，允许在小剧场内部使用自包含的内联脚本和按钮切换；禁止网络请求、外部库、父页面访问、存储和表单提交，并提供无需脚本也能阅读的默认页。" : "当前小剧场不需要脚本，使用安全 HTML/CSS 或纯文字呈现。"}小说正文保持在 <snow> 小剧场之外。`
    : "";
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
        options.storyState.weather && `当前天气：${options.storyState.weather}`,
        options.storyState.scene && `当前场景：${options.storyState.scene}`,
      ].filter(Boolean).join("\n")
    : "";
  const postHistory = [presetPostHistory, character.postHistoryInstructions, options.authorNote?.position === "post_history" ? authorNoteText : ""]
    .filter(Boolean)
    .map((value) => replaceMacros(value ?? ""))
    .join("\n\n");
  const systemContent = [presetPrompt, outputProtocol, snowTheaterProtocol, loreBeforeText && `角色定义之前的世界设定：\n${loreBeforeText}`, characterDefinition, loreAfterText && `角色定义之后的世界设定：\n${loreAfterText}`, personaDefinition, storyStateText && `统一剧情状态：\n${storyStateText}\n主聊天与手机事件必须使用这一时间、地点和场景，不得自行制造冲突。`, summaryText && `已经确认的剧情摘要：\n${summaryText}`, memoryText && `已经确认的长期记忆：\n${memoryText}`, phoneText && `同一剧情中已确认的手机通信事件：\n${phoneText}\n这些事件已经真实发生，继续剧情时必须保持一致。`, options.authorNote?.position === "system" ? authorNoteText && `作者注释：\n${authorNoteText}` : ""]
    .filter(Boolean)
    .join("\n\n---\n\n");
  const coveredMessageCount = summaryText ? Math.min(messages.length, options.storySummary?.coveredMessageCount ?? 0) : 0;
  const historyCandidates = messages
    .slice(coveredMessageCount)
    .filter((message) => message.content.trim())
    .slice(-40);
  const historySource = historyCandidates
    .map((message, index) => ({
      ...message,
      content: applyPromptFilters(
        message.content,
        preset?.promptFilters,
        message.role,
        historyCandidates.length - index - 1,
      ),
    }))
    .filter((message) => message.content.trim());
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
    ...(resolvedPreset.activeModuleCount > 0 ? [{
      id: "preset",
      label: "提示词预设",
      detail: `${preset?.name ?? "Preset"} · ${resolvedPreset.activeModuleCount} 个模块`,
      estimatedTokens: estimateTokens(resolvedPreset.activeModules.map((module) => replaceMacros(module.content)).join("\n\n")),
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

  const baseHistoryMessages: ModelMessage[] = historySource.map((message) => ({ role: message.role, content: replaceMacros(message.content) }));
  const historyInjections = [
    ...loreInHistory.map(({ entry, content }) => ({
      depth: Math.max(0, entry.insertionDepth ?? 4),
      order: entry.insertionOrder,
      content: `世界书 · ${entry.name}：\n${replaceMacros(content)}`,
    })),
    ...(authorNoteText && options.authorNote?.position === "in_history" ? [{
      depth: Math.max(0, options.authorNote.depth),
      order: Number.MAX_SAFE_INTEGER,
      content: `作者注释：\n${authorNoteText}`,
    }] : []),
  ];
  const injectionsByIndex = new Map<number, typeof historyInjections>();
  historyInjections.forEach((injection) => {
    const index = Math.max(0, baseHistoryMessages.length - injection.depth);
    injectionsByIndex.set(index, [...(injectionsByIndex.get(index) ?? []), injection]);
  });
  const historyMessages: ModelMessage[] = [];
  for (let index = 0; index <= baseHistoryMessages.length; index += 1) {
    const injections = injectionsByIndex.get(index)?.sort((left, right) => left.order - right.order) ?? [];
    injections.forEach((injection) => historyMessages.push({ role: "system", content: injection.content }));
    if (index < baseHistoryMessages.length) historyMessages.push(baseHistoryMessages[index]);
  }

  const restoredPresetModules = restorePresetStructureMarkers(preset);
  const usesPromptMarkers = restoredPresetModules.some((module) => module.marker);
  let modelMessages: ModelMessage[];
  if (usesPromptMarkers) {
    const declaredMarkers = new Set(restoredPresetModules.flatMap((module) => module.marker ? [module.marker] : []));
    const markerContent = {
      personaDescription: personaDefinition,
      worldInfoBefore: loreBeforeText,
      charDescription: characterDescription,
      charPersonality: characterPersonality,
      worldInfoAfter: loreAfterText,
      scenario: scenarioText,
      dialogueExamples,
    };
    const runtimeContext = [
      outputProtocol,
      snowTheaterProtocol,
      !declaredMarkers.has("personaDescription") ? personaDefinition : "",
      !declaredMarkers.has("worldInfoBefore") ? loreBeforeText : "",
      !declaredMarkers.has("charDescription") ? characterDescription : "",
      !declaredMarkers.has("charPersonality") ? characterPersonality : "",
      !declaredMarkers.has("worldInfoAfter") ? loreAfterText : "",
      !declaredMarkers.has("scenario") ? scenarioText : "",
      !declaredMarkers.has("dialogueExamples") ? dialogueExamples : "",
      storyStateText && `统一剧情状态：\n${storyStateText}\n主聊天与手机事件必须使用这一时间、地点和场景，不得自行制造冲突。`,
      summaryText && `已经确认的剧情摘要：\n${summaryText}`,
      memoryText && `已经确认的长期记忆：\n${memoryText}`,
      phoneText && `同一剧情中已确认的手机通信事件：\n${phoneText}\n这些事件已经真实发生，继续剧情时必须保持一致。`,
      options.authorNote?.position === "system" && authorNoteText ? `作者注释：\n${authorNoteText}` : "",
    ].filter(Boolean).join("\n\n---\n\n");
    modelMessages = runtimeContext ? [{ role: "system", content: runtimeContext }] : [];
    let insertedHistory = false;
    resolvedPreset.activeModules.forEach((module) => {
      if (module.marker === "chatHistory") {
        modelMessages.push(...historyMessages);
        insertedHistory = true;
        return;
      }
      if (module.marker) {
        const content = markerContent[module.marker as keyof typeof markerContent];
        if (content) modelMessages.push({ role: "system", content });
        return;
      }
      const content = replaceMacros(module.content);
      if (content.trim()) modelMessages.push({ role: module.role ?? "system", content });
    });
    if (!declaredMarkers.has("chatHistory") && !insertedHistory) modelMessages.push(...historyMessages);
    const characterPostHistory = [
      character.postHistoryInstructions,
      options.authorNote?.position === "post_history" ? authorNoteText : "",
    ].filter(Boolean).map((value) => replaceMacros(value ?? "")).join("\n\n");
    if (characterPostHistory) modelMessages.push({ role: "system", content: characterPostHistory });
  } else {
    modelMessages = [
      { role: "system", content: systemContent },
      ...presetRoleMessages,
      ...historyMessages,
      ...(postHistory ? [{ role: "system" as const, content: postHistory }] : []),
      ...presetPostRoleMessages,
    ];
  }
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
        marker: module.marker,
        priority: module.priority,
        estimatedTokens: estimateTokens(replaceMacros(module.content)),
      })),
      promptMessages,
      warnings,
    },
  };
}
