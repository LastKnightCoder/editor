# 官网生产部署记录

部署项目 tau-website，生产分支 master，源码 `f036c270c30bf75f76952e5bf853f2a0e2ad5d25`。从干净隔离工作树构建，不包含手机版本等未提交修改；只部署官网，没有部署插件门户或客户端。

| 项目         | 值                                                                       |
| ------------ | ------------------------------------------------------------------------ |
| 生产站点     | https://taunote.app                                                      |
| 新部署 ID    | `66cf1b76-e62d-414d-accf-5339d3d7297e`                                   |
| 固定部署地址 | https://66cf1b76.tau-website-cvr.pages.dev                               |
| 前一生产部署 | `0df736c5-26f5-44ac-8e5c-35d341cf2674`，源码 ed300cc                     |
| 构建         | 类型与 Functions 类型检查通过，生产构建通过                              |
| 测试         | 官网 69 项、发布清单运行时行为 5 项通过                                  |
| 上传         | 632 个文件中上传 277 个，355 个复用，Functions/_headers/_routes 同步上传 |

生产首页、/docs/plugins/、/docs/todos/、/developers/task-data/、/developers/user-data/ 和 /changelog/ 均 HTTP 200，标题对应本地产物。主入口脚本及两个文档搜索索引的线上字节与本地一致，开发文档索引含 todoLists.create 和 todo-list.updated。

| 静态资源                                  | SHA-256                                                            |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `/assets/developers-search-CfpA3W98.json` | `40ff082bc390cb15ae66adee658cf267436c678ac62b63eeb7dd9d4752a46637` |
| `/assets/docs-search-DTTOt1wX.json`       | `1a2cc6debece8e61c08e90e0f634e38538aff8b9877d97a51e084ee0e8669025` |
| `/assets/main-5EkBmbdE.js`                | `483b97ff69823082ffd91aa57a3697cf7e84fc0c910d705d04622e72c433bac3` |

初次并发 HTTP 检查出现一次自定义域名证书主机名不匹配；随后普通 HTTPS 和完整复验通过。公开 DNS 与本机解析一致，Cloudflare 域名状态、验证状态均 active。没有变更 DNS/SSL 设置，也没有关闭 TLS 校验。

线上下载信息仍按现有 Pages Functions 读取真实发布清单，本次没有修改安装包或下载统计服务，没有触发真实安装包下载。未进行浏览器截图、视觉或真机验收。

本机验证状态 `/tmp/tau-website-deploy-state.json`，页面及资源证据 `/var/folders/np/fm5y9kyj2b78fjytbyz8h5b4psthqs/T/tau-website-deploy-v_j4c8jn`；部署输出 `/tmp/tau-website-deploy.log`。旧部署保留，可按 Pages 部署历史回退。
