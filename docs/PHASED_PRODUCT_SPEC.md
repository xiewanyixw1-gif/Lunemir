# Lunemir 长期产品规范与分阶段开发计划

本文档是 Lunemir 的长期范围基线。实现遵循“本地优先、统一剧情状态、模块化、真实数据、逐阶段可运行”的原则；未完成能力不得用静态数据或无效按钮伪装。

## 1. 产品目标

Lunemir 是兼容常见角色卡、世界书和提示词预设的 AI 角色扮演与剧情模拟系统。它在主剧情工作台之外提供一部虚拟手机，并通过统一的 Story Event 让聊天、消息、关系、时间线、记忆和后续手机应用共享同一个剧情事实源。

当前交付形态是 Next.js 本地优先网页应用，可由 Netlify 托管；桌面阶段在此领域层之上增加 Tauri 2 外壳、SQLite Repository、主窗口与独立置顶手机窗口，不重写角色、上下文和事件规则。

## 2. 不可违背的架构规则

1. 每项剧情数据必须绑定 `storyId`；不同故事不得串联。
2. 主界面和手机不得分别维护剧情事实，必须读写同一个事件仓库。
3. AI 只能提出结构化事件；程序负责验证、去重、提交、同步和回滚。
4. AI 推测不能直接成为长期记忆；记忆必须保留来源并经过确认。
5. API Key 不进入 Git、角色卡、备份或日志。
6. 离线时仍可浏览和编辑所有本地数据；云模型生成明确依赖网络。
7. 每个阶段必须具备真实持久化、错误处理、测试和迁移路径。

## 3. 领域模块

- Project / Story：项目、独立剧情、当前时间地点、场景和状态。
- Character / Persona：角色卡、多版本、多用户人设和剧情绑定。
- Conversation：消息、版本、分支、章节点、搜索、收藏和导入导出。
- Preset / Prompt Manager：可排序、可组合、可禁用的提示词模块与冲突检查。
- Lorebook：关键词、组合触发、优先级、概率、预算和作用域。
- Memory：短期上下文、可编辑剧情摘要、长期确认记忆和后续向量检索。
- Story Event：结构化剧情事件、校验、通知、去重、回滚和历史。
- Phone：联系人、消息、社交、电话、相册、日历、备忘、邮件、任务与设置。
- Provider：OpenAI-compatible 起步，后续增加 Claude、Gemini、Ollama、LM Studio 和 KoboldCpp 适配器。

## 4. 分阶段交付

### Stage 1 · 可运行 MVP

目标是打通以下真实链路：

```text
主剧情回复
  → AI 提出结构化手机事件
  → 程序校验、去重并写入 storyEvents
  → 手机显示未读消息
  → 用户在手机回复并写入同一 storyId
  → 下一次主剧情编译时读取手机事件
```

本阶段还包含角色卡导入、本地角色和人设、基础流式聊天、模型配置、基础预设和世界书、多会话以及本地聊天保存。网页版本中的悬浮手机与主窗口共用 IndexedDB；独立操作系统窗口不在本阶段伪装实现。

验收：重启后手机通信仍存在；切换会话后事件隔离；手机回复出现在上下文检查器的“手机联动”段；没有模型配置时不会制造假消息。

### Stage 2 · 剧情系统

增加 Story、StoryState、剧情时间、地点、人物关系、NPC 调度、摘要、回滚、多人群聊、世界书高级触发和完整 Prompt Manager。NPC 主动行为由用户动作或剧情时间推进触发，具有频率、冷却、安静时段和关系条件，不运行无约束后台循环。

### Stage 3 · 完整虚拟手机

在统一事件引擎上逐个加入社交动态、文字电话、相册、日历、备忘、邮件、任务和通知中心。每个应用可单独启用；内容必须关联角色、事件或剧情时间。

### Stage 4 · 桌面与高级扩展

增加 Tauri 2 双窗口、SQLite 迁移、系统置顶/快捷键/尺寸与位置恢复；随后增加图片、语音、本地向量记忆、多模型分工和权限受控插件系统。

## 5. Stage 1 事件契约

首个事件集合：

- `phone_message_received`：角色向用户发送手机消息；
- `phone_message_sent`：用户通过手机回复角色。

事件必须包含 `id`、`storyId`、`eventType`、`actorId`、`targetId`、`content`、`storyTime`、`source`、`status` 和 `createdAt`。只有校验通过且状态为 `committed` 的事件能进入上下文。五分钟内同一剧情、角色、类型和正文相同的事件视为重复。

当前过渡模型以 Conversation ID 作为 Story ID，保证现有多会话立即隔离；Stage 2 增加独立 Story 表后通过迁移保留这些 ID 的映射。

## 6. 数据演进

当前 IndexedDB v4 保存 characters、conversations、personas、presets、lorebooks、storyEvents、settings。完整备份格式 v4 包含事件。桌面迁移目标至少包含 projects、stories、characters、character_versions、personas、presets、prompt_modules、worldbooks、worldbook_entries、conversations、messages、story_states、story_events、relationships、memories、memory_summaries、phone_contacts、phone_messages、social_posts、social_comments、phone_calls、phone_photos、calendar_events、notifications、model_configs 和 app_settings。

## 7. 长期验收场景

1. 主剧情触发手机未读消息并可查看。
2. 手机回复能影响下一轮主剧情。
3. 同一角色在主界面和手机保持设定一致。
4. 剧情时间和手机事件时间来自同一 Story State。
5. 多 NPC 可在群聊和社交动态中互动。
6. 重启后聊天、摘要、关系、记忆和手机记录恢复。
7. 两个 Story 的角色状态、事件和记忆完全隔离。
8. 断网后本地管理和历史浏览可用，本地模型可继续生成。

## 8. 每阶段交付报告

每次发布记录完成内容、未完成内容、数据迁移、修改文件和测试结果。任何“建议”“规划中”“桌面阶段”的能力均不得标记为已完成。
