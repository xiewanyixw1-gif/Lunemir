import type {
  CharacterRecord,
  CompiledContext,
  ContextSegment,
  LorebookEntry,
  MatchedLore,
  ModelMessage,
  PersonaRecord,
  PresetRecord,
  StoredMessage,
} from "./types";

export type ContextOptions = {
  persona?: PersonaRecord | null;
  preset?: PresetRecord | null;
  externalLoreEntries?: LorebookEntry[];
};

export function estimateTokens(text: string) {
  const cjk = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const other = Math.max(0, text.length - cjk);
  return Math.max(1, Math.ceil(cjk * 1.15 + other / 4));
}

function matchesLore(entries: LorebookEntry[], transcript: string): MatchedLore[] {
  return entries
    .filter((entry) => entry.enabled)
    .filter((entry) => {
      if (entry.constant) return true;
      const haystack = entry.caseSensitive ? transcript : transcript.toLocaleLowerCase();
      const keys = entry.caseSensitive ? entry.keys : entry.keys.map((key) => key.toLocaleLowerCase());
      const primaryMatch = keys.some((key) => key && haystack.includes(key));
      if (!primaryMatch) return false;
      if (!entry.selective || entry.secondaryKeys.length === 0) return true;
      const secondary = entry.caseSensitive
        ? entry.secondaryKeys
        : entry.secondaryKeys.map((key) => key.toLocaleLowerCase());
      return secondary.some((key) => key && haystack.includes(key));
    })
    .sort((left, right) => right.priority - left.priority || left.insertionOrder - right.insertionOrder)
    .map((entry) => ({
      entry,
      reason: entry.constant ? "常驻条目" : `关键词：${entry.keys.slice(0, 3).join("、")}`,
    }));
}

export function compileContext(
  character: CharacterRecord,
  messages: StoredMessage[],
  contextLimit: number,
  options: ContextOptions = {},
): CompiledContext {
  const persona = options.persona;
  const preset = options.preset;
  const replaceMacros = (value: string) => value
    .replaceAll(/{{char}}/gi, character.name)
    .replaceAll(/{{user}}/gi, persona?.name || "用户");
  const transcript = messages.slice(-24).map((message) => message.content).join("\n");
  const allLoreEntries = [...character.lorebookEntries, ...(options.externalLoreEntries ?? [])];
  const matchedLore = matchesLore(allLoreEntries, transcript);
  const characterDefinition = [
    `你正在扮演 ${character.name}。`,
    character.description,
    character.personality && `性格：${character.personality}`,
    character.scenario && `当前场景：${character.scenario}`,
    character.systemPrompt,
  ].filter(Boolean).map(replaceMacros).join("\n\n");
  const personaDefinition = persona
    ? `与您互动的用户人设是 ${persona.name}。\n${replaceMacros(persona.description)}`
    : "";
  const presetPrompt = preset ? replaceMacros(preset.systemPrompt) : "";
  const loreText = matchedLore.map(({ entry }) => `[${entry.name}]\n${entry.content}`).join("\n\n");
  const postHistory = [preset?.postHistoryInstructions, character.postHistoryInstructions]
    .filter(Boolean)
    .map((value) => replaceMacros(value ?? ""))
    .join("\n\n");
  const systemContent = [presetPrompt, characterDefinition, personaDefinition, loreText && `相关世界设定：\n${loreText}`]
    .filter(Boolean)
    .join("\n\n---\n\n");

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
    ...(presetPrompt ? [{
      id: "preset",
      label: "提示词预设",
      detail: preset?.name ?? "Preset",
      estimatedTokens: estimateTokens(presetPrompt),
    }] : []),
    ...(loreText ? [{
      id: "lore",
      label: "世界书命中",
      detail: `${matchedLore.length} 个条目`,
      estimatedTokens: estimateTokens(loreText),
    }] : []),
    {
      id: "history",
      label: "最近对话",
      detail: `${messages.length} 条消息`,
      estimatedTokens: estimateTokens(transcript),
    },
  ];

  const modelMessages: ModelMessage[] = [
    { role: "system", content: systemContent },
    ...messages
      .filter((message) => message.content.trim())
      .slice(-40)
      .map((message) => ({ role: message.role, content: message.content })),
    ...(postHistory ? [{ role: "system" as const, content: postHistory }] : []),
  ];
  const estimatedTokens = modelMessages.reduce((total, message) => total + estimateTokens(message.content), 0);
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
      warnings,
    },
  };
}
