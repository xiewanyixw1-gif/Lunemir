import type { AppearanceSettings, CharacterRecord, ModelConfig, PersonaRecord } from "./types";

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  baseUrl: "",
  model: "",
  temperature: 0.8,
  maxTokens: 1200,
  contextLimit: 32000,
};

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: "moon",
  blur: 18,
  opacity: 48,
  radius: 22,
  glassMode: "full",
  backgroundMode: "character",
  readingStyle: "cinematic",
  messageStyle: "novel-flow",
  glassScope: "chrome-only",
  glassOpacity: 48,
  glassBlur: 18,
  glassBorderOpacity: 14,
  glassHighlight: 8,
  glassShadow: 28,
  backgroundBrightness: 78,
  backgroundBlur: 0,
  backgroundOverlay: 34,
  backgroundVignette: 46,
  backgroundFit: "cover",
  backgroundScale: 100,
  backgroundPositionX: 50,
  backgroundPositionY: 24,
  showCharacterAvatar: true,
  showUserAvatar: true,
  showCharacterName: true,
  showUserName: true,
  showTimestamp: false,
  avatarLayout: "header",
  avatarShape: "rounded",
  avatarSize: 38,
  avatarGap: 12,
  fontFamily: "serif",
  fontSize: 17,
  fontWeight: 400,
  lineHeight: 1.85,
  paragraphSpacing: 14,
  messageMaxWidth: 860,
};

export function createId(prefix: string) {
  const value = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${value}`;
}

export function createSampleCharacter(): CharacterRecord {
  const now = new Date().toISOString();

  return {
    id: "character_seren_sample",
    schemaVersion: 1,
    spec: "v2",
    specVersion: "2.0",
    sourceFormat: "lunemir-sample",
    sourceName: "Lunemir Sample",
    name: "Seren Vale",
    nickname: "Seren",
    description: "月港旧档案馆的年轻档案员，负责保管被城市遗忘的名字与门。她冷静、敏锐，很少直接说出全部真相。",
    personality: "克制、温柔、观察细致。说话带有轻微的诗意，但不会堆砌辞藻。她尊重用户的选择，并记得做过的约定。",
    scenario: "深夜的月港刚下过雨。用户正在旧钟塔下等待 Seren，寻找一扇只有知道真名的人才能看见的门。",
    firstMessage: "你终于来了。雨刚停，整座城都像被月光重新擦拭过一遍。",
    exampleMessages: "{{char}}：先别抬头。打开我留在你手机里的那张照片。\n{{user}}：门就在钟塔里吗？\n{{char}}：门不在一个固定的地方，它只在被正确记住时出现。",
    systemPrompt: "始终以 Seren Vale 的身份回应，保持沉浸感，不替用户决定行动。",
    postHistoryInstructions: "延续当前场景和已经建立的约定。",
    alternateGreetings: [],
    tags: ["奇幻", "月港", "剧情"],
    creator: "Lunemir",
    characterVersion: "1.0",
    creatorNotes: "用于 Lunemir 首次启动的示例角色。",
    lorebookName: "月港 · 示例世界书",
    lorebookEntries: [
      {
        id: "lore_clocktower",
        name: "旧钟塔",
        keys: ["钟塔", "旧钟塔", "门"],
        secondaryKeys: [],
        content: "旧钟塔位于月港旧城区。午夜后，知道无名门真名的人可能在钟面背后看见一条不属于现实的走廊。",
        enabled: true,
        constant: false,
        selective: false,
        priority: 90,
        insertionOrder: 10,
        caseSensitive: false,
        extensions: {},
      },
      {
        id: "lore_curfew",
        name: "月港宵禁",
        keys: [],
        secondaryKeys: [],
        content: "月港在午夜实行宵禁，巡夜人会检查仍在旧城区活动的人。",
        enabled: true,
        constant: true,
        selective: false,
        priority: 80,
        insertionOrder: 20,
        caseSensitive: false,
        extensions: {},
      },
    ],
    extensions: {},
    raw: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultPersona(): PersonaRecord {
  const now = new Date().toISOString();
  return {
    id: createId("persona"),
    schemaVersion: 1,
    name: "旅行者",
    description: "一位谨慎而好奇的旅行者。请不要替我决定行动或内心想法。",
    createdAt: now,
    updatedAt: now,
  };
}
