# Lunemir 格式兼容性

## 角色卡

v0.2 支持：

- Character Card V1 JSON；
- Character Card V2 JSON 与 PNG `chara` tEXt 数据块；
- Character Card V3 JSON 与 PNG `ccv3` tEXt 数据块；
- 同一 PNG 同时包含 `ccv3` 和 `chara` 时优先读取 `ccv3`；
- 角色卡内嵌 `character_book`、备用开场白、扩展字段和 PNG 头像；
- 开场白除标准 `first_mes` 外，也兼容常见的 `first_message`、`firstMessage`、`greeting` 与 `greetings` 字段；
- 导入前预览、格式提示与 20 MB 文件上限。
- 支持在角色页新建、编辑、复制和删除角色，并导出 Character Card V2 JSON；
- Lunemir JSON 导出会在扩展字段保存 Data URL 头像，重新导入时可恢复，其他应用可以安全忽略该扩展。

尚未支持角色卡资源包、压缩备份以及 iTXt/zTXt PNG 元数据。导入不会执行 HTML 或 JavaScript，也不会覆盖已有角色。

实现参考：

- [Character Card V2 Specification](https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md)
- [Character Card V3 Specification](https://github.com/kwaroran/character-card-spec-v3/blob/main/SPEC_V3.md)

## 模型接口

模型客户端面向 OpenAI-compatible API：

- 默认使用 `GET {baseUrl}/models` 读取模型，同时允许把模型列表端点改为相对路径或完整 URL；
- 模型列表兼容顶层数组，以及 `data`、`models`、`items`、`result.data`、`result.models` 等常见返回结构；
- 默认使用 `POST {baseUrl}/chat/completions` 聊天，同时允许自定义聊天端点；
- 支持 SSE `data:` 流和普通 JSON 回退；
- 识别 `reasoning_content`、`reasoning`、`thinking`、`reasoning_details` 与回复中的 `<think>` / `<reasoning>` 思考内容，并与最终正文分开展示；
- 读取 `finish_reason` / `stop_reason`，遇到 `length`、`max_tokens` 或 `max_output_tokens` 时最多自动续写两次；
- 流结束时会消费没有尾部换行的最后一个 SSE 数据块，避免丢失末段；
- 支持 Bearer API Key、Temperature、Max Tokens 与上下文窗口配置；
- 可建立多个语言模型站点预设并快速切换，旧版单一模型配置会自动迁移为首个预设；
- 生图接口拥有独立预设，默认调用 `POST {baseUrl}/images/generations`，兼容图片 URL 与 Base64 结果，并允许自定义模型列表和生成端点。
- 可按接口选择 `max_tokens` 或 `max_completion_tokens`，预设采样参数只临时覆盖基础模型配置；
- 读取 `finish_reason` 和接口返回的 Token usage；接口不返回 usage 时使用本地估算，并在达到输出上限时提供继续生成；
- 支持浏览器端中止生成。

接口必须允许部署域名进行 CORS 跨域访问。部分只实现聊天或生图、未实现 `/models` 的兼容服务可能无法通过“测试连接”，但仍可手动填写模型 ID 后发起生成。

角色回复支持安全 HTML 白名单渲染，包括常用文本标签、列表、表格、`details`、Ruby 注音、链接和受限内联样式。预设自带的 `<style>`、class 与状态栏 UI 会进入单条消息的 Shadow DOM 隔离层，CSS 不会影响 Lunemir 外壳；脚本、表单、媒体、外链资源、事件属性、远程 URL 与可能覆盖页面的固定定位不会执行。

混合输出会把围栏外的 Markdown/小说正文与带标题的 HTML 代码围栏分开渲染；旧预设使用的 `[UI_PANEL]...[/UI_PANEL]` 与 `[MEMORY_PANEL]...[/MEMORY_PANEL]` 会分别迁移为原生状态组件和回忆书签。依赖 JavaScript 的 HTML 不会执行，常见“正在渲染…”占位文字会隐藏并尽量展示剩余静态内容。

## 独立世界书与预设

- 支持以 `entries` 对象或数组为核心的 World Info JSON；
- 读取 `key`、`keysecondary`、`comment`、`content`、`constant`、`order`、`disable` 与大小写选项；
- 导入后自动绑定当前角色，之后可以逐本启停；
- 支持新建、编辑、复制、删除和导出独立世界书；
- 编辑器可管理主次关键词、内容、常驻、组合触发、启用状态、大小写匹配、优先级和条目顺序；
- 世界书库同时列出所有角色卡内嵌世界书与独立世界书；内嵌条目可直接编辑，独立世界书按角色分别启停；
- 新建和复制的世界书默认绑定当前角色，删除时从全部角色绑定中安全移除；
- 支持包含 `prompts`、`prompt_order` 和 OpenAI 常用采样字段的聊天预设；
- 应用 `temperature`、`openai_max_tokens`、`openai_max_context`，并保留完整原始 JSON。
- 支持新建、编辑、复制、删除和导出聊天预设；
- 提示词模块可单独启停、排序，并配置系统提示或历史后置位置与优先级；
- Lunemir 导出使用 `lunemir_position` 保存模块插入位置，其他应用可以安全忽略该扩展字段；
- 识别常见 `regex_scripts` / `regexScripts` 数组中的 AI 输出替换规则，并保留规则开关；
- Lunemir 原生预设使用 `lunemir_output_renderer` 保存 Markdown、HTML/CSS 隔离开关、小剧场主题、原生组件和 Regex 配置；
- 当预设提示词或 Regex replacement 已定义 HTML/CSS、状态栏或 UI 模板时，模型上下文与显示层都会优先遵守该格式；
- 状态栏支持 `:::status 标题` / `:::`，通用组件支持 `:::widget 标题` / `:::`；也会安全转换 `lunemir-status`、`lunemir-widget` 及少量常见状态标签；

复杂世界书能力如正则关键词、递归激活、概率、包含组、插入深度和 Outlet 会保留在原始数据中，但当前上下文编译器尚未执行这些高级规则。预设当前执行独立模块启停、位置、优先级与顺序；输出层支持安全 Markdown、小剧场、原生状态组件、受约束 Regex 和消息级隔离 CSS，但不会执行导入预设中的 JavaScript、全局 CSS 或网络资源，也尚不支持多预设组合。世界书行为参考 [SillyTavern World Info 文档](https://github.com/SillyTavern/SillyTavern-Docs/blob/main/Usage/worldinfo.md)，预设字段参考 [SillyTavern 默认 Chat Completion 预设](https://github.com/SillyTavern/SillyTavern/blob/release/default/content/presets/openai/Default.json)。

## 本地数据

IndexedDB v5 保存角色、每个角色的多会话与剧情分支、章节点、长期记忆、Story Event、世界书、人设、预设和非敏感设置。人设扩展字段与头像保存在人设记录中；剧情到人设的绑定保存在设置对象中，旧数据没有绑定时会采用最近使用的人设并为当前剧情建立绑定。API Key 按接口预设保存在独立的本机密钥存储中，不写入导出备份；恢复备份也不会覆盖本机密钥。当前备份格式为 `lunemir-backup` v6 JSON，同时可恢复 v1 至 v6 备份；恢复操作会替换当前浏览器内的 Lunemir 内容数据。
