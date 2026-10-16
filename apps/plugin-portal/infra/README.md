# 配置与运行

本期尚未配置线上资源。不要复用已有 `tau-release`，不要为待审桶开启公共域名或r2.dev。这里的配置是本地模板，不能带零值database_id直接部署。

## 本地

Node.js 24+。UI专家只需 `pnpm --filter @tau/plugin-portal dev:web`（web交付后）和显式模拟模式即可开发，无需提前配置GitHub/R2。后端检查命令：`pnpm --filter @tau/plugin-portal check`、`test`、`build:api`（只构建，不部署）。

在仓库根运行 `pnpm --filter @tau/plugin-portal db:local`、`pnpm --filter @tau/plugin-portal dev:api`。Wrangler本地模拟D1/R2，不访问云端桶。真实GitHub登录需独立开发OAuth App：Homepage `http://localhost:5173`，callback `http://localhost:8787/v1/auth/github/callback`。复制本目录 `.dev.vars.example` 为 `.dev.vars` 并在本机填写，不能提交。

TOKEN_ENCRYPTION_KEY 为32随机字节的base64。可以用本机密码管理器或命令生成后写入本地文件，不发聊天。生产与开发分别生成。密钥用于加密保留在服务端会话中的GitHub token。

## 线上配置顺序（由后端agent执行，需账号授权）

1. Cloudflare登录授权Worker/D1/R2管理；检查 xiongtao.life 已接入的Zone和现有DNS，不能覆盖已有域名。
2. 创建私有R2桶 `tau-plugin-pending`。Worker直接绑定，无需另外生成R2 Access Key；首期上传经过Worker，浏览器不直连R2，不需要桶CORS。
3. 创建D1数据库 `plugin-portal`，保存真实database_id。
4. 将wrangler.jsonc复制为本机忽略的wrangler.production.jsonc；替换database_id，vars改为 `WEB_ORIGIN=https://plugins.xiongtao.life`、`API_ORIGIN=https://plugins-api.xiongtao.life`。添加Worker custom domain route（plugins-api.xiongtao.life），先检查未被占用。生产仍关闭workers.dev。
5. GitHub Settings → Developer settings → OAuth Apps，新建生产App：Homepage `https://plugins.xiongtao.life`，callback `https://plugins-api.xiongtao.life/v1/auth/github/callback`。第一期只登录和验证公开仓库，不申请写代码、私有仓库或邮件权限。第二期审核机器人另配GitHub App，不复用用户登录令牌发平台审核消息。
6. 经wrangler secret put配置GITHUB_CLIENT_ID、GITHUB_CLIENT_SECRET、TOKEN_ENCRYPTION_KEY，均使用production config；不把值写入Git。应用D1 migrations到明确的production config，再部署Worker。
7. UI交付后创建Cloudflare Pages项目，构建命令 `pnpm --filter @tau/plugin-portal build:web`，输出 `apps/plugin-portal/web/dist`。生产VITE_API_BASE_URL指向API域名，禁用VITE_MOCK_API；绑定plugins.xiongtao.life。
8. 真实登录、上传、保存、提交、刷新验收。未完成此步不能称线上闭环完成。

未来第二期再创建公开发布桶和plugins-cdn域名，第一期不需要。

## 数据与维护

包限制8MiB，图片2MiB，不做分片上传。Worker静态检查ZIP，不运行作者代码。R2对象使用随机上传ID，只写一次；数据库是提交状态事实源。上传完成后没有被草稿引用的文件可能残留，第一期上线前需要配置/执行基于数据库引用的清理；不得按对象年龄删除已引用的待审文件。会话7天过期，上传等待记录1小时后不可写，过期会话和OAuth状态应定期清理。

当前配置引用：

- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/d1/reference/migrations/
- https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
