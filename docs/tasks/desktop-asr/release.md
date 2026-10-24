# ASR SDK 与 Seed 发行

目标：发布插件 SDK 0.43.0，更新统一模板与文档，发布 Seed 0.1.0 并提交插件中心。

## 工作清单

- [x] Investigate/Triage/Understand the problem：确认 npm 当前 0.42.0、UI 0.5.0，发布账号可用，Seed 首次绑定需要公开仓库。
- [x] 从隔离工作区打包仅包含 ASR/WebSocket/整理用途的 SDK 并验证。
- [x] 发布 npm，核对下载摘要，更新模板正式依赖与锁文件。
- [x] Seed 正式依赖构建、GitHub Release、插件中心提交与上架核验。

## 发行边界

- 用户明确授权发布 SDK、更新模板文档及发布 Seed；不发布客户端。
- 当前工作区同时有未完成的编辑器、白板契约改动。发行 SDK 从基线 2f4995176 的独立工作区构建，仅加入 ASR 相关文件；对比 npm 0.42.0，已有类型只修改 ai/contract/index/permissions/settings，没有删类型或混入编辑器协议变化。
- 线上 Android 0.2.6 的公开包 SHA256 为 9149bcef8357b607de53717b78e8f141e92be0c3a98854d57d7b72030aa86316；本地产物摘要一致，原生和前端均无 ASR/WebSocket 接口。因此发行最低客户端定为桌面 0.59.5、Android/iOS 0.2.7；移动源码版本同步为 0.2.7，不覆盖线上 0.2.6。
- Seed 源码仓库只含本任务代码、说明及合成测试夹具；检查后公开以满足插件中心绑定规则。不提交真实密钥、录音或转录正文。
- 真实 Seed 账号识别及移动录音仍未实测，不把构建／契约测试写为真机验收。

## 验证与结果

- npm：`@xiongtao.xt/tau-plugins@0.43.0` 已发布；元数据完整性及实际下载字节均与候选包一致。UI 沿用已发布的 0.5.0，没有重发。
- SDK 隔离源码：`codex/asr-sdk-0.43.0`，接口提交 `53552c34b`。266 项 SDK 测试通过；已发布类型与 0.42.0 对比仅涉及本次接口，不包含工作区中的编辑器／白板开发。
- 模板默认分支 main 已更新，提交 `e52737bf41409a74d0dfcad56f32f10c039d6db7`；使用正式 npm 0.43.0 和精确锁文件。独立新 store 的冻结安装、构建及专项模板验证通过，sdkSource=npm，templateLockfileReused=true。发布 SDK 附带的文档与此模板文档逐字一致。
- Seed：公开仓库 main / v0.1.0，提交 `5a7acb68b01a3ec0e24359d8166e512f77a5b8f6`；正式 npm 冻结安装、6 项协议测试、构建与 7 项宿主契约测试通过。GitHub Release 和插件中心都已发布 0.1.0。
- 中心 releaseId：`9af2ae2d-91c7-407c-946b-98e819cb5a97`；ZIP `13992` 字节，SHA256 `4db1d2f3c7d2777c15d775b971e1212f247b99406e458338e72ca5a666eb4f9c`，与本地及 GitHub 资产摘要一致。
- 插件中心按最低版本匹配：旧 Android 0.2.6 与桌面 0.59.0 不兼容；桌面 0.59.5、Android/iOS 0.2.7 匹配成功。当前公开 Android 0.2.6 不会安装新接口插件。
- GitHub 当前凭据没有 workflow scope，新增工作流推送被拒绝。本次采用现有权限直接发布标签、Release 和中心审核；没有扩大凭据权限，没有启用自动 CI。候选工作流留在本机 output/asr-release，未来需要时再配置。
- Chrome 自动 setFiles 缺少扩展本地文件权限，改用系统文件选择框上传已验证 ZIP，没有修改扩展权限。

## 发布地址与后续

- [SDK 0.43.0](https://www.npmjs.com/package/@xiongtao.xt/tau-plugins/v/0.43.0)
- [统一模板](https://github.com/LastKnightCoder/tau-plugin-template)
- [插件中心](https://plugins.taunote.app/plugins/tau.asr-seed)
- [GitHub Release](https://github.com/LastKnightCoder/tau-plugin-asr-seed/releases/tag/v0.1.0)

本次未发布桌面或移动客户端；客户端发布仍须完成对应打包／设备验收。0.43.0 发布包已不可覆盖；当前主工作区还有其他未完成契约变更，后续 SDK 发行必须使用新版本，不能从该工作区重发 0.43.0。
