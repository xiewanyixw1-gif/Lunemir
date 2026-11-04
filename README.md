# Lunemir

> A world that remembers you.

Lunemir 是一个本地优先、可高度美化的 AI 角色互动空间。项目目标是兼容常见角色卡、世界书与提示词预设，并通过悬浮小手机把角色的消息、相册和记忆延伸到聊天窗口之外。

当前版本已经从视觉原型进入可用的本地运行时阶段：角色、对话和配置写入 IndexedDB，可导入标准角色卡，并能直接连接用户自己的 OpenAI-compatible 接口进行流式对话。

## 已完成

- 深色毛玻璃应用外壳与响应式布局
- IndexedDB 角色、会话与配置持久化
- Character Card V1 / V2 / V3 JSON 与 PNG 导入预览
- 内嵌及独立 World Info 世界书导入、按角色启停与关键词命中
- 聊天预设导入、切换和采样参数应用
- 用户人设编辑并注入真实上下文
- OpenAI-compatible 模型连接、模型列表、流式生成与中止
- 消息编辑与最后回复重新生成
- 继续生成、回复历史版本切换与 Markdown 对话导出
- 主题配色、模糊度、透明度与圆角本地持久化
- 全屏与消息框两种毛玻璃布局
- 角色卡背景、自定义本地背景与移动端顶部导航
- 可用鼠标或触摸拖动的悬浮手机
- 基于实际角色、世界书和聊天记录的上下文检查器
- 可展开的 Lunemir Phone
- JSON 本地完整备份与恢复
- PWA manifest 与 Netlify 静态部署配置
- 产品需求与架构文档

API Key 只保存在当前页面内存，不写入 IndexedDB 或备份。由于请求由浏览器直接发出，所连接的接口需要允许当前站点进行 CORS 跨域访问。

## 本地运行

需要 Node.js 22 与 pnpm。

```bash
pnpm install
pnpm dev
```

生产构建：

```bash
pnpm build
```

静态产物输出到 `out/`，Netlify 会根据仓库根目录的 `netlify.toml` 自动完成构建。

## 文档

- [产品需求文档](docs/PRODUCT_REQUIREMENTS.md)
- [技术架构](docs/ARCHITECTURE.md)
- [实施路线图](docs/ROADMAP.md)
- [格式兼容性](docs/COMPATIBILITY.md)

## 项目原则

- 用户内容与 API 密钥默认只保存在当前设备。
- 导入内容始终先预览，不静默覆盖现有数据。
- AI 只能通过受约束的结构化事件修改长期记忆和手机状态。
- 基础体验必须能在不启用动画和模糊效果时正常使用。

## 当前状态

`0.5.0` · 沉浸式界面与背景定制阶段。仓库暂未选择开源许可证；在许可证确定前，默认保留全部权利。
