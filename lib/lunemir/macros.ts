const CHARACTER_MACRO = /\{\{\s*(?:char|character)\s*\}\}|<\s*(?:char|character)\s*>|\[\s*(?:char|character)\s*\]/gi;
const PERSONA_MACRO = /\{\{\s*(?:user|persona|user_name)\s*\}\}|<\s*(?:user|persona)\s*>|\[\s*(?:user|persona)\s*\]/gi;
const RANDOM_MACRO = /\{\{\s*random\s*(?:::([^{}]*?)|:([^{}]*?))\s*\}\}/gi;

function stableIndex(seed: string, size: number) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % Math.max(1, size);
}

export function replaceRoleMacros(value: string, characterName: string, personaName = "用户") {
  return value
    .replace(CHARACTER_MACRO, () => characterName || "角色")
    .replace(PERSONA_MACRO, () => personaName || "用户");
}

export function replaceRandomMacros(value: string, seed = "lunemir") {
  let occurrence = 0;
  return value.replace(RANDOM_MACRO, (source, doubleColon: string | undefined, singleColon: string | undefined) => {
    const rawOptions = (doubleColon ?? singleColon ?? "").trim();
    const separator = doubleColon !== undefined ? "::" : ",";
    const options = rawOptions.split(separator).map((option) => option.trim()).filter(Boolean);
    if (options.length === 0) return source;
    const selected = options[stableIndex(`${seed}:${occurrence}:${rawOptions}`, options.length)];
    occurrence += 1;
    return selected;
  });
}
