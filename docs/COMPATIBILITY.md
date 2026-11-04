# Lunemir 格式兼容性

## 角色卡

v0.2 支持：

- Character Card V1 JSON；
- Character Card V2 JSON 与 PNG `chara` tEXt 数据块；
- Character Card V3 JSON 与 PNG `ccv3` tEXt 数据块；
- 同一 PNG 同时包含 `ccv3` 和 `chara` 时优先读取 `ccv3`；
- 角色卡内嵌 `character_book`、备用开场白、扩展字段和 PNG 头像；
- 导入前预览、格式提示与 20 MB 文件上限。
- 支持在角色页新建、编辑、复制和删除角色，并导出 Character Card V2 JSON；
- Lunemir JSON 导出会在扩展字段保存 Data URL 头像，重新导入时可恢复，其他应用可以安全忽略该扩展。

尚未支持角色卡资源包、压缩备份以及 iTXt/zTXt PNG 元数据。导入不会执行 HTML 或 JavaScript，也不会覆盖已有角色。

实现参考：

- [Character Card V2 Specification](https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md)
- [Character Card V3 Specification](https://github.com/kwaroran/character-card-spec-v3/blob/main/SPEC_V3.md)

## 模型接口

模型客户端面向 OpenAI-compatible API：

- `GET {baseUrl}/models` 用于连接测试和模型列表；
- `POST {baseUrl}/chat/completions` 用于聊天；
- 支持 SSE `data:` 流和普通 JSON 回退；
- 支持 Bearer API Key、Temperature、Max Tokens 与上下文窗口配置；
- 支持浏览器端中止生成。

接口必须允许部署域名进行 CORS 跨域访问。部分只实现聊天、未实现 `/models` 的兼容服务可能无法通过“测试连接”，但仍可在模型 ID 正确时发起聊天。

## 独立世界书与预设

- 支持以 `entries` 对象或数组为核心的 World Info JSON；
- 读取 `key`、`keysecondary`、`comment`、`content`、`constant`、`order`、`disable` 与大小写选项；
- 导入后自动绑定当前角色，之后可以逐本启停；
- 支持新建、编辑、复制、删除和导出独立世界书；
- 编辑器可管理主次关键词、内容、常驻、组合触发、启用状态、大小写匹配、优先级和条目顺序；
- 新建和复制的世界书默认绑定当前角色，删除时从全部角色绑定中安全移除；
- 支持包含 `prompts`、`prompt_order` 和 OpenAI 常用采样字段的聊天预设；
- 应用 `temperature`、`openai_max_tokens`、`openai_max_context`，并保留完整原始 JSON。
- 支持新建、编辑、复制、删除和导出聊天预设；
- 提示词模块可单独启停、排序，并配置系统提示或历史后置位置与优先级；
- Lunemir 导出使用 `lunemir_position` 保存模块插入位置，其他应用可以安全忽略该扩展字段；

复杂世界书能力如正则关键词、递归激活、概率、包含组、插入深度和 Outlet 会保留在原始数据中，但当前上下文编译器尚未执行这些高级规则。预设当前执行独立模块启停、位置、优先级与顺序，但尚不执行多预设组合和应用专属的高级标记模块。世界书行为参考 [SillyTavern World Info 文档](https://github.com/SillyTavern/SillyTavern-Docs/blob/main/Usage/worldinfo.md)，预设字段参考 [SillyTavern 默认 Chat Completion 预设](https://github.com/SillyTavern/SillyTavern/blob/release/default/content/presets/openai/Default.json)。

## 本地数据

IndexedDB v4 保存角色、每个角色的多会话与剧情分支、章节点、长期记忆、Story Event、世界书、人设、预设和非敏感设置。API Key 只保留在页面内存，不写入数据库或备份。当前备份格式为 `lunemir-backup` v4 JSON，同时可恢复 v1、v2 与 v3 备份；恢复操作会替换当前浏览器内的 Lunemir 数据。
