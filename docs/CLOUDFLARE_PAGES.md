# Cloudflare Pages 部署

Lunemir 使用 Next.js 静态导出，不依赖 Pages Functions。仓库已经包含 Node 版本与 Cloudflare Pages 响应头配置。

## GitHub 自动部署

1. 在 Cloudflare 控制台进入 **Workers & Pages**。
2. 选择 **Create application → Pages → Import an existing Git repository**。
3. 授权 GitHub，并只选择 `xiewanyixw1-gif/Lunemir` 仓库。
4. 选择框架预设 **Next.js (Static HTML Export)**。
5. 使用以下构建设置：

   - Production branch：`main`
   - Root directory：留空
   - Build command：`pnpm run build`
   - Build output directory：`out`

6. 开始部署。完成后会获得 `https://<project>.pages.dev` 地址；之后每次推送 `main` 都会自动更新。

## 数据说明

Lunemir 的角色、聊天、世界书、预设和设置仍保存在访问设备自己的 IndexedDB 中。因此电脑本地预览与手机打开 Pages 地址时是两份独立的本地数据，需要分别导入，或使用 Lunemir 备份文件迁移。API Key 不会随 GitHub 或 Cloudflare 部署上传。
