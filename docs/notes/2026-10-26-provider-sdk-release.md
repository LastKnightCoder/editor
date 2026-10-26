# SDK 0.47.0 与提供方插件发行记录

日期：2026-10-26（Asia/Shanghai）。范围为提供方设置归位的 SDK、作者模板及八个插件；未发布桌面或移动客户端。

## SDK 与源码

[@xiongtao.xt/tau-plugins 0.47.0](https://www.npmjs.com/package/@xiongtao.xt/tau-plugins/v/0.47.0) 已公开下载。npm dist.integrity 与本地已验证候选一致，公开下载字节逐一相同。UI 继续使用已发布的 0.5.0。

发行在独立工作区完成，固定源码为 [34bf4c74e](https://github.com/LastKnightCoder/editor/commit/34bf4c74e)，远端分支 codex/provider-sdk-0.47.0。相对公开 0.46.0 的包仅有两份设置声明、版本信息与相关作者文档变化，没有带入并行正文退役改动。该工作区 SDK 类型检查与 289 项测试全部通过。

模板使用 SDK 0.47.0 和正式 npm 锁文件；冻结安装、构建及独立作者契约验证通过，main 已推送。SDK 随包文档来自模板 b446469，模板后续 b899fd5 只同步支持矩阵格式。

## 插件发行

| 插件              | 正式标签                                                                                   | 源码提交       |
| ----------------- | ------------------------------------------------------------------------------------------ | -------------- |
| Qwen 语音         | [v0.1.12](https://github.com/LastKnightCoder/tau-plugin-tts-qwen/releases/tag/v0.1.12)     | `d4c34964b0e8` |
| MiniMax 语音      | [v0.1.12](https://github.com/LastKnightCoder/tau-plugin-tts-minimax/releases/tag/v0.1.12)  | `77cebe4ca72e` |
| OpenAI 图片       | [v0.2.8](https://github.com/LastKnightCoder/tau-plugin-images-openai/releases/tag/v0.2.8)  | `7fa6f67c94cc` |
| YouTube           | [v0.2.5](https://github.com/LastKnightCoder/tau-plugin-youtube/releases/tag/v0.2.5)        | `fe4a1aaaa0eb` |
| Bilibili          | [v0.2.5](https://github.com/LastKnightCoder/tau-plugin-bilibili/releases/tag/v0.2.5)       | `16d089b9d261` |
| 豆包语音识别      | [v0.1.2](https://github.com/LastKnightCoder/tau-plugin-asr-seed/releases/tag/v0.1.2)       | `ecbc9570dec7` |
| S3 发布           | [v0.1.8](https://github.com/LastKnightCoder/tau-plugin-publish-s3/releases/tag/v0.1.8)     | `a894872fa142` |
| GitHub Pages 发布 | [v0.1.8](https://github.com/LastKnightCoder/tau-plugin-publish-github/releases/tag/v0.1.8) | `eb2c131254c0` |

各仓 main 与正式标签指向同一批通过验证的提交。八个 GitHub Actions 标签任务均成功，GitHub Release 与插件中心均已发布；中心 ZIP 的 SHA-256 等于 GitHub 发行资产摘要，包内全部文件与真实 npm 作者验证构建一致。最低客户端版本为桌面 0.60.2，声明移动支持的插件为 Android / iOS 0.2.9。

ASR 新接入标准 OIDC 自动发行流程。首次新增工作流与 v0.1.1 同时推送后，GitHub 仅触发 main 校验，没有标签发行任务；递增到 0.1.2，重新冻结安装、测试、构建，并先推源码再单独推标签后成功。v0.1.1 标签未移动，没有对应正式发行包。

## 验证与边界

- 八插件及模板在仓库外以全新缓存从 npm 冻结安装，类型检查与构建全部通过；八插件已有测试共 38 项通过。
- ASR 三端宿主协议验证 7 项通过；不替代真实账号、手机真机与视觉验收。
- 模板独立作者验证 status=passed、sdkSource=npm、templateLockfileReused=true。
- 本地证据位于 output/provider-release-047/，包含 npm 摘要、包差异、冻结安装报告、CI 状态、中心发行元数据与下载 ZIP。
- 主仓发行源和子模块指针已本地提交；SDK 发行源独立分支与各插件默认分支已推送。主仓 master 尚有本机其他工作，本次没有推送 master。
