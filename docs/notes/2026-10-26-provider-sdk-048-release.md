# SDK 0.48.0 与提供方插件发行记录

日期：2026-10-26（Asia/Shanghai）。范围为提供方表单两端渲染补全的 SDK、作者模板与九个插件；未发布桌面或移动客户端。

## SDK

[@xiongtao.xt/tau-plugins 0.48.0](https://www.npmjs.com/package/@xiongtao.xt/tau-plugins/v/0.48.0) 已公开下载，dist.integrity 为 `sha512-zEJqvDwyShJ1atbb46bDfcXH1WgFCQN6p/ZQhyONrBrRzpqaxKOq0556J1OZcTsr17soxaygtMKAEaxXr3pcwg==`，与本地打包产物逐字节相同。源码为主仓库 835201e9e。UI 包与已发布 0.5.0 仅 LICENSE 换行符不同，继续使用 0.5.0；依赖与 peerDependencies 与 0.47.0 相同。

## 插件发行

| 插件              | 正式标签 | 源码提交  | 中心与 GitHub ZIP SHA-256 |
| ----------------- | -------- | --------- | ------------------------- |
| 豆包语音识别      | v0.1.3   | `b651ba4` | `06990e1282e7…`           |
| MiniMax 语音      | v0.1.13  | `1d2277e` | `f1da486379d7…`           |
| Qwen 语音         | v0.1.13  | `3fd0038` | `10ce1151ae7a…`           |
| OpenAI 图片       | v0.2.9   | `d927c37` | `5c3b8c2947da…`           |
| YouTube           | v0.2.6   | `1133e9c` | `e60ad167de97…`           |
| S3 发布           | v0.1.9   | `d0c466f` | `f9775d97a049…`           |
| S3 同步           | v0.4.4   | `a5a4cda` | `9f1641ee21af…`           |
| S3 上传           | v0.3.4   | `0292d9a` | `823e0b60bcbf…`           |
| GitHub Pages 发布 | v0.1.9   | `9983727` | `f64c05235ca2…`           |

模板 main 为 `03ed616`（SDK 0.48.0，不打标签）。九个标签的 GitHub Actions 发行任务均成功；插件中心记录的 sha256、中心下载与 GitHub Release ZIP 三者一致。中心 ZIP 的 main.js 与 manifest 与本地以正式 npm SDK 构建的产物逐字节相同，文本文件仅换行符不同（CI 在 Linux 构建）。最低客户端版本未变：桌面 0.60.2，声明移动支持的插件为 Android / iOS 0.2.9。

## 验证与边界

- 发布前以候选 tarball、发布后以正式 npm SDK 各做一次仓库外冻结安装、类型检查、构建与已有测试，十个工程（九个插件与模板）均通过；publish-github 7 项测试通过。
- `verify-portable-author.mjs --published --frozen-template` 在本机 Windows 上 pnpm 进程以 0xC0000409 异常退出（临时目录含中文与空格），未取得报告；模板已由上述作者验证覆盖冻结安装与构建。
- 宿主侧的新展示（语音输入设置、TTS 移动表单、发布抽屉内嵌表单）需包含主仓库 835201e9e 的客户端；旧客户端可安装新插件，只是不显示新增的说明与链接，publish-github 0.1.9 在旧客户端插件详情里仍显示表单但发布抽屉只给跳转。
- 发行门槛：插件最低桌面版本 0.60.2 尚未发布，当前正式客户端为 0.60.1。0.60.2 必须从包含 835201e9e 的提交构建：更早的宿主注册校验不认识 `service-choice`，publish-github 0.1.9 会激活失败；其余插件新增的 `link`、选项说明在旧校验下被忽略，不影响激活。
- 视觉、真机与真实账号验收未做。
