# Lunemir 格式兼容性

## 角色卡

v0.2 支持：

- Character Card V1 JSON；
- Character Card V2 JSON 与 PNG `chara` tEXt 数据块；
- Character Card V3 JSON 与 PNG `ccv3` tEXt 数据块；
- 同一 PNG 同时包含 `ccv3` 和 `chara` 时优先读取 `ccv3`；
- 角色卡内嵌 `character_book`、备用开场白、扩展字段和 PNG 头像；
- 导入前预览、格式提示与 20 MB 文件上限。

尚未支持独立世界书文件、预设、角色卡资源包、压缩备份以及 iTXt/zTXt PNG 元数据。导入不会执行 HTML 或 JavaScript，也不会覆盖已有角色。

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

## 本地数据

IndexedDB v1 保存角色、每个角色的当前会话和非敏感设置。API Key 只保留在页面内存，不写入数据库或备份。当前备份格式为 `lunemir-backup` v1 JSON；恢复操作会替换当前浏览器内的 Lunemir 数据。
