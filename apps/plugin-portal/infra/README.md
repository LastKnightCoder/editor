# 配置与运行

2026-10-16 已配置线上基础设施；前端尚未部署。不要复用已有 `tau-release`。`wrangler.jsonc` 仅供本地模拟，正式部署使用已纳入Git的 `wrangler.production.jsonc`（只含非秘密资源ID）。

## 已配置资源

| 资源     | 实际配置                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------- |
| R2       | `tau-plugin-pending`，私有，r2.dev关闭，无自定义域名                                                    |
| D1       | `plugin-portal`，ID `dabf8820-d2bc-47ab-984d-dc4f0c2ae0bd`，0001 migration已执行                        |
| Worker   | `tau-plugin-portal-api`，绑定D1与R2                                                                     |
| API域名  | `https://plugins-api.xiongtao.life`，健康检查200、会话200、GitHub跳转302                                |
| Pages    | `tau-plugin-portal`，Direct Upload项目，production branch为master，无前端部署                           |
| 前端域名 | `plugins.xiongtao.life`，CNAME指向 `tau-plugin-portal.pages.dev`，代理开启；Pages验证与域名状态均active |
| Secrets  | GITHUB_CLIENT_ID、GITHUB_CLIENT_SECRET、TOKEN_ENCRYPTION_KEY已配置                                      |

GitHub密钥源于用户 `~/.zshrc` 的 `TAU_PLUGIN_GITHUB_CLIENT_ID` / `TAU_PLUGIN_GITHUB_CLIENT_SECRET`，仅经进程内存传入Wrangler标准输入。加密密钥备份在 `~/.config/tau/plugin-portal/token-encryption-key`（0600），不可提交或随意重建，否则现有会话无法解密。云端Secrets不依赖worktree存在。

Wrangler OAuth的DNS API请求返回403；前端CNAME已通过登录的Cloudflare管理页面创建，其他域名记录未更改。

## UI完成后的部署

Pages为Direct Upload，不监听editor仓库自动发布。在本包目录执行：

```sh
VITE_API_BASE_URL=https://plugins-api.xiongtao.life VITE_MOCK_API=false pnpm build:web
pnpm exec wrangler pages deploy web/dist --project-name tau-plugin-portal --branch master --force
```

当前Wrangler 4.151.1默认Pages命令会委托到新版Workers路径；`--force`选择经典Pages项目。生产环境也已保存API地址和禁用模拟设置，但Direct Upload的本地Vite构建必须显式传变量。未部署前网页不可用。

后端后续部署：

```sh
pnpm exec wrangler d1 migrations apply plugin-portal --remote --config infra/wrangler.production.jsonc
pnpm exec wrangler deploy --config infra/wrangler.production.jsonc
```

尚待：前端首发、真实GitHub回调和上传联调；令牌自动刷新和会话过期协调仍需按已约定补齐后验证。

## 本地

Node.js 24+。UI专家只需 `pnpm --filter @tau/plugin-portal dev:web`（web交付后）和显式模拟模式即可开发，无需提前配置GitHub/R2。后端检查命令：`pnpm --filter @tau/plugin-portal check`、`test`、`build:api`（只构建，不部署）。

在仓库根运行 `pnpm --filter @tau/plugin-portal db:local`、`pnpm --filter @tau/plugin-portal dev:api`。Wrangler本地模拟D1/R2，不访问云端桶。真实GitHub登录需独立开发OAuth App：Homepage `http://localhost:5173`，callback `http://localhost:8787/v1/auth/github/callback`。复制本目录 `.dev.vars.example` 为 `.dev.vars` 并在本机填写，不能提交。

TOKEN_ENCRYPTION_KEY 为32随机字节的base64。可以用本机密码管理器或命令生成后写入本地文件，不发聊天。生产与开发分别生成。密钥用于加密保留在服务端会话中的GitHub token。

## 线上配置顺序（由后端agent执行，需账号授权）

1. Cloudflare登录授权Worker/D1/R2管理；检查 xiongtao.life 已接入的Zone和现有DNS，不能覆盖已有域名。
2. 创建私有R2桶 `tau-plugin-pending`。Worker直接绑定，无需另外生成R2 Access Key；首期上传经过Worker，浏览器不直连R2，不需要桶CORS。
3. 创建D1数据库 `plugin-portal`，保存真实database_id。
4. 正式配置已保存为wrangler.production.jsonc；其资源ID与域名可以提交，密钥只放Cloudflare Secrets。新环境需独立核对database_id和域名。生产关闭workers.dev和preview_urls。
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
