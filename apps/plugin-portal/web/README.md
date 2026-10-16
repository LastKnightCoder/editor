# 发布门户前端（C19 第一期）

四个页面：`/login`、`/submissions`、`/submissions/new`、`/submissions/:id`。终点为「待审核」，没有批准 / 发布 / 下载入口。

## 命令

```bash
pnpm --filter @tau/plugin-portal dev:web      # http://localhost:5173，连 VITE_API_BASE_URL（默认 http://localhost:8787）
pnpm --filter @tau/plugin-portal build:web    # 产物 web/dist，含 Pages SPA fallback（public/_redirects）
pnpm --filter @tau/plugin-portal check:web
pnpm --filter @tau/plugin-portal test:web
```

## 环境变量

| 变量                | 说明                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `VITE_API_BASE_URL` | 发布服务地址，默认 `http://localhost:8787`。登录按钮顶层导航到 `${VITE_API_BASE_URL}/v1/auth/github`。 |
| `VITE_MOCK_API`     | 只有写成 `true` 才启用模拟；仅 `dev:web` 可用。                                                        |

本地覆盖写在 `web/.env.local`（已被 .gitignore 忽略）。

## 模拟模式

```bash
VITE_MOCK_API=true pnpm --filter @tau/plugin-portal dev:web
```

- **显式开启**：不设置或写成其他值都直连真实后端；真实请求失败只显示错误，不会回退到模拟数据。
- **生产禁用**：`build:web` 遇到 `VITE_MOCK_API=true` 直接报错；运行时 `import.meta.env.DEV` 为假时也会拒绝，模拟代码不会进入构建产物。
- **数据**：存在 `localStorage`（`tau-portal:mock-db`），刷新后保留，可演示刷新恢复草稿。上传的图片内容只在当前页面内存中，刷新后预览会显示「无法预览」（样本图片除外）。
- **登录**：模拟模式下「使用 GitHub 登录」跳到 `/submissions?mock_login=1`，相当于真实回调成功落地。
- **右下角「模拟模式」面板**切换场景：

| 场景                                           | 操作                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| 空列表 / 列表加载失败                          | 提交列表 → 空列表 / 加载失败                                                      |
| 上传网络中断 / 校验失败 / 服务异常             | 上传 → 对应选项；文件名含 `bad` 或 `invalid` 的 ZIP 也会校验失败                  |
| 上传取消（含「校验中取消、服务端其实已完成」） | 打开「慢速上传」，在上传中或校验中点取消                                          |
| 会话过期                                       | 「下一次请求会话过期」，然后做任意操作                                            |
| 旧 revision 冲突                               | 「下一次保存遇到其他窗口的新版本」，修改后保存                                    |
| 提交失败                                       | 提交 → 仓库未通过 / GitHub 不可用；「响应丢失」模拟服务端已提交但响应在网络中丢失 |
| OAuth 失败                                     | 面板按钮，跳到 `/login?error=oauth_failed`                                        |
| 刷新恢复草稿                                   | 修改任意字段不保存，直接刷新                                                      |
| 待审只读                                       | 样本「微信读书摘录」，或提交任意草稿                                              |

样本数据（`src/api/mock/samples.ts`）：可提交的完整草稿、缺图标且 commit 不完整的半成品、刚创建的空草稿、一条待审核记录。「重置样本数据」恢复初始状态。

## 结构

```text
src/
  api/            传输层：PortalApi 接口、HTTP 实现（fetch + XHR 上传）、401 守卫、错误模型
    mock/         显式模拟适配器、状态样本、场景面板
  app/            Provider、路由、会话、壳层
  pages/          四个页面
  features/submission/
    uploadFlow.ts     上传编排（取消/中断后读取 Upload 核对结果）
    draftState.ts     编辑状态机（revision 冲突、本机暂存与恢复）
    validation.ts     与协议一致的前端预检与提交检查清单
  components/     通用展示件、安全 Markdown 渲染
```

## 关键行为

- 所有请求 `credentials: "include"`；写操作（含上传与退出）带 `X-CSRF-Token`，令牌取自 `GET /v1/session`。
- 上传：`POST /v1/uploads` 拿票据 → XHR `PUT ticket.uploadUrl`（`withCredentials`、票据头 + CSRF），进度达到 100% 但响应未到时显示「校验中」。`uploadUrl` 必须与 API 同源，否则拒绝发送（避免把 Cookie / CSRF 发往别处）。
- 取消或网络中断后读取 `GET /v1/uploads/:id` 核对：仍在 `checking` 自动轮询；取消前已 `ready` 的由用户选择「仍然使用 / 放弃」；不原地重传，重新上传会申请新票据。
- 新建页用 `sessionStorage` 中的 `clientRequestId` 创建草稿，刷新或重试复用同一 ID，成功后跳详情。
- 未保存修改实时暂存在 `localStorage`（`tau-portal:unsaved:<id>`），刷新或会话过期重新登录后恢复；暂存基于旧 revision 时不自动覆盖，由用户决定。
- 409按错误码分流：REVISION_CONFLICT读取最新版本，让用户比较修改；SUBMISSION_LOCKED读取并进入只读；VERSION_ALREADY_SUBMITTED、PLUGIN_OWNERSHIP_CONFLICT展示具体说明，不盲目重读当前草稿。兼容旧CONFLICT。
- 上传UPLOAD_STATE_CONFLICT读取核对，UPLOAD_EXPIRED确定失败并重新申请上传；保存与提交阶段的fields均映射到表单，修改输入后清除对应旧错误。
- 提交版本冲突或网络结果未知时读取记录核对，若已为待审核直接展示只读页；其他业务拒绝直接展示原因。
- 介绍 Markdown 用自带的子集解析器渲染为 React 元素：原始 HTML 按文字显示，链接只允许 http/https/mailto，不加载远程图片。
- 图片预览走 `GET /v1/uploads/:id/content`（带 Cookie 取 Blob 再转对象 URL），不直接写 `<img src>`。
