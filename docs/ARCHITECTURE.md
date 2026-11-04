# Lunemir 技术架构

## 1. 当前实现

当前版本使用 Next.js、React 和 TypeScript，并通过静态导出部署到 Netlify。应用不依赖 Lunemir 自有服务器：结构化数据保存在 IndexedDB，模型请求从浏览器直接发送至用户配置的 OpenAI-compatible 接口。

`app/hooks/useLunemirRuntime.ts` 是当前应用服务边界，负责协调 UI、存储、导入、上下文编译与模型客户端；`lib/lunemir/` 中的模块保持独立，方便后续拆分 Provider 与 Repository 接口。

## 2. 建议分层

```text
Presentation
├─ Chat workspace
├─ Character / lore editors
├─ Context inspector
├─ Theme system
└─ Lunemir Phone

Application
├─ Conversation service
├─ Import / export service
├─ Context compiler
├─ Memory service
└─ Phone event service

Domain
├─ Character
├─ Persona
├─ Lorebook
├─ Preset
├─ Conversation / Branch
├─ Memory
├─ Theme
└─ PhoneEvent

Infrastructure
├─ IndexedDB repositories
├─ Model provider adapters
├─ File parsers
├─ Encryption
└─ Backup archive
```

UI 不直接调用模型或数据库。所有数据读写通过应用服务完成，便于未来增加桌面端、云同步或自动化测试。

## 3. 核心领域对象

每个对象都包含 `id`、`schemaVersion`、`createdAt` 与 `updatedAt`。

- `Character`：标准字段、扩展字段、头像与来源格式；
- `Persona`：用户身份和会话范围设置；
- `Lorebook`：条目、触发器、优先级和作用域；
- `Preset`：提示词片段、插入顺序和生成参数；
- `Conversation`：角色、用户人设、活动分支和场景状态；
- `Message`：角色、内容、版本、附件与生成元数据；
- `Memory`：类型、可信度、来源消息和确认状态；
- `Theme`：设计变量和资源引用；
- `PhoneEvent`：类型、发起者、负载、触发时间和处理状态。

## 4. 模型适配器

统一接口应包含：

```ts
interface ModelProvider {
  listModels(): Promise<ModelInfo[]>;
  stream(request: CompletionRequest): AsyncIterable<CompletionChunk>;
  validateConnection(): Promise<ConnectionResult>;
}
```

首版实现 OpenAI-compatible 适配器。本地模型或其他平台通过新适配器接入，不修改对话服务。

## 5. 上下文编译

上下文编译器接收角色、用户人设、会话、世界书、记忆和预算，输出：

- 最终消息数组；
- 每段内容的来源与 Token 估算；
- 世界书命中原因；
- 被裁剪或摘要的内容；
- 编译警告。

编译器必须是可测试的纯逻辑模块，不依赖 UI。

## 6. 导入层

外部格式先转为中间表示，再进入领域模型：

```text
PNG / JSON / preset
        ↓
format detector
        ↓
parser + validation
        ↓
normalized import document
        ↓
preview / conflict resolution
        ↓
domain repositories
```

未知字段保存在 `extensions` 中。解析失败时返回定位明确的错误，不产生半完成对象。

## 7. 本地存储

当前使用 IndexedDB v2 保存角色、对话、独立世界书、用户人设、提示词预设和低风险设置。数据库升级通过 `onupgradeneeded` 增量创建对象仓库，保留 v1 角色与聊天。角色卡 PNG 暂以 Data URL 随角色记录保存，后续素材层会迁移为独立 Blob 记录，避免大头像重复占用结构化存储。

API 密钥默认仅存在于会话内存。用户选择持久保存时，使用 Web Crypto 加密；浏览器端加密无法完全抵抗同源脚本攻击，因此仍需严格控制依赖、内容安全策略和 XSS 风险。

## 8. Phone Event

建议的事件信封：

```ts
type PhoneEvent = {
  id: string;
  type: "message.received" | "album.added" | "note.created";
  actorId: string;
  conversationId: string;
  payload: unknown;
  requestedAt: string;
  triggerAt?: string;
  status: "suggested" | "accepted" | "dismissed" | "delivered";
};
```

模型输出先解析为 `suggested`，随后经过 JSON Schema 验证、权限检查、重复检查和用户策略，才能进入 `accepted` 或 `delivered`。

## 9. 安全边界

- 不渲染未经处理的 HTML；
- 主题仅能修改允许的设计变量；
- 导入内容不执行 JavaScript；
- 对外请求使用明确的域名授权；
- 文件类型不能仅依赖扩展名判断；
- 日志使用事件 ID，不记录正文；
- 公共 Git 仓库只保存示例数据。

## 10. 部署

当前静态应用运行 `pnpm build` 后输出到 `out/`，由 Netlify 托管。未来如果加入平台自有代理、同步或账号系统，应把服务端单独建模，避免在静态前端中隐藏平台密钥。
