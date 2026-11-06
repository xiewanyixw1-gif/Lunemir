const CHARACTER_MACRO = /\{\{\s*(?:char|character)\s*\}\}|<\s*(?:char|character)\s*>|\[\s*(?:char|character)\s*\]/gi;
const PERSONA_MACRO = /\{\{\s*(?:user|persona|user_name)\s*\}\}|<\s*(?:user|persona)\s*>|\[\s*(?:user|persona)\s*\]/gi;

export function replaceRoleMacros(value: string, characterName: string, personaName = "用户") {
  return value
    .replace(CHARACTER_MACRO, () => characterName || "角色")
    .replace(PERSONA_MACRO, () => personaName || "用户");
}
