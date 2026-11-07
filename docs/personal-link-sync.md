# 个人外链云端同步

范围仅包括本人的标签、标签关联、笔记和熟悉度。公开外链目录继续随 Astro 静态构建发布，个人记录存入 Cloudflare D1，由 Worker 提供访问接口。不需要租用或维护服务器，不开放注册，也不接入评论服务。

## 日常使用

在外链手册点击“连接个人云端”，输入个人同步密钥。其他设备输入同一把密钥即可使用同一份记录。连接会保留 30 天；密钥通过 HTTPS 发送一次，浏览器使用 HttpOnly 会话 Cookie，网页脚本不保存密钥。

停止编辑一秒后自动同步；切回页面或页面保持可见时每 30 秒检查云端。离线期间继续保存本机记录，网络恢复后可点击“立即同步”重试。断开同步会撤销当前设备的云端会话，本机记录仍保留。

首次连接时：

- 云端没有记录：上传本机记录。
- 本机没有个人记录：读取云端记录。
- 两边已有不同记录：提示选择保留哪份，不自动覆盖。

使用已同步的基准识别后续改动。两台设备都修改后，会显示冲突提示。选择覆盖前，将被替换的一份保存为当前浏览器的恢复备份，可点击“导出恢复备份”下载，再用原有导入功能恢复。每个浏览器保留最近一次恢复备份。上传使用数据库版本比较，过期版本会被拒绝，避免多端写入静默覆盖。

## 本地验证

```sh
npm ci
cp worker/.dev.vars.example worker/.dev.vars
```

把 `worker/.dev.vars` 中的测试密钥换成至少 32 个字符的随机值。该文件已被 Git 忽略，仅用于本地开发。

```sh
npm run sync:migrate:local
npm run sync:dev
```

另一个终端运行：

```sh
PUBLIC_LINK_SYNC_URL=http://localhost:8787 npm run dev
```

通过 `http://localhost:4321/links/` 打开网页。前后端使用同一个主机名 `localhost`，跨端口允许访问；不要混用 `127.0.0.1` 和 `localhost`。

```sh
npm test
npm run check
npm run build
```

## 首次上线

1. `npx wrangler login` 连接管理 `builtbyluna.cc` 的 Cloudflare 账号。
2. 本项目的 `worker/wrangler.jsonc` 已填写线上数据库 ID。新建独立实例时，使用 `npx wrangler d1 create luna-links-personal --config worker/wrangler.jsonc` 创建数据库，再替换 `database_id`。
3. `npm run sync:migrate` 创建线上数据表。
4. 生成并妥善保存一把随机同步密钥。可以在密码管理器中生成至少 32 字符的随机值，然后运行 `npx wrangler secret put SYNC_KEY --config worker/wrangler.jsonc`，按提示输入。不要把密钥放入 Git、`PUBLIC_*` 变量或聊天记录。
5. `npm run sync:deploy` 部署 Worker；配置会绑定 `links-sync.builtbyluna.cc`。Worker 服务和网站使用同一主域名，以支持浏览器的 SameSite 会话 Cookie。
6. 在 GitHub 仓库 Actions Variables 中设置 `PUBLIC_LINK_SYNC_URL=https://links-sync.builtbyluna.cc`，再运行网站原有的 GitHub Pages 部署。未设置此变量时，网页继续使用原本的本地存储。

生产接口仅接受来自 `https://builtbyluna.cc` 的请求；本地开发命令单独覆盖允许的来源。不要给生产服务添加 `*` 来源，也不要把本地测试密钥用于线上。

## 维护

前端继续由原有 GitHub Pages workflow 发布。修改 Worker 代码后运行 `npm run sync:deploy`；新增数据库迁移后先运行 `npm run sync:migrate`。

更换 `SYNC_KEY` 会立即使旧会话失效，其他设备需要重新连接。数据库只保存会话令牌的哈希值，密钥不写入数据库。每分钟每个 Cloudflare 节点最多约 5 次连接尝试；这只是辅助限流，密钥本身必须随机且足够长。

浏览器的 JSON 导出继续保留，建议在批量导入或清理数据前备份。Cloudflare 的免费额度有用量上限，账号控制台可以查看使用量。

本版将个人记录保存为单份文档，限制为 UTF-8 编码后 1.9 MB，以留出 D1 单值容量余量。超出时拒绝上传并保留本机记录，不会截断笔记。
