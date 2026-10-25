# ASR SDK 与 Seed 发行

当前裁决：先整理文档，不发布新 SDK。本轮同时撤回依赖新 SDK 的模板／Seed 升版准备，不推送版本标签、不上传插件包。以下 0.43.0／Seed 0.1.0 内容保留为历史发行记录。

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

## Windows 合并后的源码与发布包核对

本轮已将远端 Windows 修复与本地已提交功能合并到本地 master，合并提交为 `b79fd77e0`。其他未完成工作已恢复到主工作区，完整 stash 与文件备份保留。Windows 的支持边界以 [实测记录](./windows-validation.md) 为准；不把平台评估完成写成原生录音可用。

### 当前版本

| 对象     | 实际状态                                               |
| -------- | ------------------------------------------------------ |
| 插件 SDK | npm 最新为 0.44.0；0.44.1 未发布，本地版本号已恢复     |
| UI SDK   | 沿用 0.5.0，没有新发行                                 |
| 模板     | 保持 1.2.3，依赖 npm SDK 0.44.0，未发布 1.2.4          |
| Seed     | 保持已发布 0.1.0，依赖 npm SDK 0.43.0，未发布 0.1.1    |
| 客户端   | 本轮未安装或发布；源码中的版本要求不等于产品入口已开放 |

### 已确认的差异

对比 npm 0.44.0 tarball 与合并后已提交源码的重建产物：前者有 263 个类型声明文件，后者有 259 个；另有 16 个同名声明文件内容不同。数量只是差异线索，不是兼容性判断的替代品。

- 已发布根入口导出 `useTextField`、`TextFieldEditor`；对应源码仍在本地未提交改动中。
- 已发布包含 `elementVersions.d.ts`、`useTextFieldBinding.d.ts`、`content-contracts.d.ts`、`unknownNode.d.ts`，当前已提交源码重建缺少这些声明文件。
- 这证明已发布包不能由当前已提交源码完整重现；它不单独证明这些接口不可用，也不能据此宣称相关编辑器任务已经完成。ASR 接口并非本次差异中缺失的部分。
- npm 0.44.0 基准 SHA-512：`PJqlIxBs10lgbXsRwR+PabQF33jkWzLCLw3WLh5Bif30S9c5U7jeBGbjNg7bLnMePgzaZxK6Aw5mdEnFToKhOg==`。

曾准备仅修改已发布包文档的 0.44.1 候选，以保持运行时及类型字节不变。该方法不能解决源码不可复现的问题；用户现要求只整理文档，已撤回版本号、依赖升级、未发布更新记录与专用重打包脚本。候选不作为正式发行物，也不作为后续默认发布方案。

### 本轮文档整理

- [x] Investigate/Triage/Understand the problem：核对发布包、已提交源码和本地编辑器改动，分清事实与未验证结论。
- [x] 更新 Windows 结果、入口撤回状态及模板／Seed 使用说明。
- [x] 撤回 SDK、模板、Seed 的候选版本与依赖修改，保留已发布版本和锁文件。
- [x] 检查文档链接、生成副本和版本一致性；主工作区文档检查通过，0 处警告，模板生成副本一致。

下一步是按对应编辑器任务核对已公开接口的源码、依赖、实现与验证状态，使指定 Git 提交可重现发行产物；此事尚未完成。重新发布需要后续明确指令，本轮不继续 SDK 或插件发行。
