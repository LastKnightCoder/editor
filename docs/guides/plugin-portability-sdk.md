# 跨端 SDK 与统一模板验证

## 已发布 SDK 的作者验证

官方模板使用 npm 的插件 SDK 0.42.0 和 UI 0.5.0。在仓库根运行：

```sh
node scripts/plugins/verify-portable-author.mjs output/plugin-release/author-npm.json --published --frozen-template
```

判据：报告为 passed、sdkSource 为 npm、templateLockfileReused 为 true，依赖从注册表获取，不引用仓库或本地 tarball。官方模板地址为 https://github.com/LastKnightCoder/tau-plugin-template 。

## 生成 SDK

在仓库根运行：

```sh
node scripts/plugins/sync-author-docs.mjs --check
node scripts/plugins/package-sdk.mjs output/plugin-phase-a/sdk
```

API 支持矩阵只编辑 packages/plugins/docs/api-support.md，随后运行 `node scripts/plugins/sync-author-docs.mjs --write` 更新模板副本；打包器强制检查一致性，同一副本随 SDK tarball 分发。不要分别维护两张矩阵。

判据：生成插件 SDK 与 UI 两个 tgz；版本取各自 package.json。仅打包，不执行 npm publish；已发布版本不可覆盖，修改公共包内容须使用新版本。

正式发布这两个 tgz 后，确认注册表可查询版本，且 dist.integrity 与本地包一致，再开始真实 npm 验证。npm 返回 202 表示已受理，发布扫描结束前可能仍无法安装；等待扫描完成，不重复发布或覆盖版本。

## 准备模板输入

进入 `plugins/tau-plugin-template`，使用实际生成的文件名：

```sh
node use-local-sdk.mjs ../../output/plugin-phase-a/sdk/xiongtao.xt-tau-plugins-0.42.0.tgz ../../output/plugin-phase-a/sdk/xiongtao.xt-tau-ui-0.5.0.tgz
pnpm install
pnpm build
```

tarball 保存在忽略的 `.sdk` 目录，依赖与锁文件只使用相对 file 地址。修改 SDK 导致输入内容变化时更新锁文件；旧锁仍引用已移除依赖而被策略拒绝时，先核对依赖变更，再 `pnpm clean --lockfile` 和重新 install。自有 SDK/UI 包使用按包名配置的发布时间例外，避免升级时旧锁文件阻止解析；第三方依赖年龄与完整性策略继续执行。

产物必须保持 formatVersion 3、portable、web-v1。模板与中心共用 validatePortableDistributionManifest，无效版本、含移动目标的非空业务权限应在构建时失败；附加元信息被忽略，合法的预发布与构建标识可正常使用，上一产物保留。install:local 仍拒绝写入旧桌面正式目录；release 工作流可以提交格式 3，但服务端按既有身份与绑定规则决定本人 CI 自动批准或人工审核，平台测试由作者负责。正式发布前只声明实际通过验收且中心已开放的平台，本地构建验证不自动上传。

## 仓库外验证

```sh
node scripts/plugins/verify-portable-author.mjs
```

判据：报告 `output/plugin-phase-a/author-report.json` 为 passed，并包含：

- 独立临时作者目录、中文/空格路径、独立依赖存储；SDK/UI 类型与依赖不解析回仓库。
- 生成新锁并进行冻结安装；作者源码 strict 检查通过，当前仍沿用 skipLibCheck: true。
- 同一模板的页面与编辑器入口都可构建，ZIP 文件与摘要匹配。
- 三端平台声明、最低版本与实际静态贡献装配通过。
- Node 和宿主私有入口依赖被拒绝，失败构建不替换上一有效产物。
- 正式目录安装被拒绝；没有运行任何生产上传或 npm 发布。

确认模板锁文件已与当前本地 SDK 一致后，验证原锁直接可复用：

```sh
node scripts/plugins/verify-portable-author.mjs output/plugin-phase-a/author-frozen-report.json --frozen-template
```

判据：报告 templateLockfileReused 为 true。若失败，核对 tarball 与锁文件，不把未冻结安装描述为通过。

## 回归与边界

```sh
pnpm --filter @tau/plugins test
pnpm --filter @tau/plugins check
pnpm --filter mobile exec tsc --noEmit
pnpm --filter desktop exec tsc --noEmit
pnpm check:plugin-process-boundaries
pnpm check:docs
```

旧作者验证脚本显式选择旧 desktop 清单，不把 portable 字段塞进旧格式。公共 SDK 的宿主入口不随作者 tarball 开放。

仓库外报告不证明正式壳、真机交互或应用商店审核；各项分别按宿主指南验收。SDK 发布不自动开放插件中心平台，也不代表所有 API 已有宿主实现；支持边界以随包分发的 API 支持矩阵为准。

## 同步与上传提供方候选验证

1. 使用 `node scripts/plugins/package-sdk.mjs output/storage-sdk` 生成当前 SDK/UI tarball。
2. 设置 `TAU_AUTHOR_NAMES` 为逗号分隔的目标子模块名称，执行 `node scripts/plugins/verify-official-authors.mjs <SDK.tgz> <UI.tgz> output/storage-authors/report.json`，确认每个作者的冻结安装、构建与测试通过。候选 ZIP 保存到报告同目录的 packages/。
3. 需要记录待发行锁文件时设置 `TAU_AUTHOR_WRITE_LOCKFILES=1`；脚本只将已验证候选 tarball 的摘要映射到 package.json 声明的公开版本，不执行发布。SDK/UI 公开发布前，普通 npm 安装仍需使用候选注入流程。
4. 设置 `TAU_STORAGE_AUTHORS_REPORT` 为报告绝对路径，在 apps/mobile 执行 `pnpm exec vitest run --config validation/storage/vitest.config.ts`。判据是同一批 ZIP 在 desktop/android/ios 环境注册四类同步、四类上传及八个领域表单，并经相同 value/save 完成保存。
5. 配合根进程边界检查、移动 Rust 测试及 Clippy、两端类型检查和前端构建。视觉、真机、最低系统和后台行为另行验收，不从本机 JSDOM 或 Rust 单测外推。

发行顺序为 SDK/UI、使用同一协议的中心、声明移动目标的提供方包，最后发布客户端。客户端升级保留旧配置，服务未安装/未启用时给出恢复入口；不将缺包记为同步成功，不静默改为本地。

SDK/UI 可安装后，用 `TAU_AUTHOR_NAMES` 限定本次发行的作者仓库，执行 `node scripts/plugins/verify-official-authors.mjs --published <报告路径>`。判据是 sdkSource 为 npm，各工程冻结安装、构建及已有测试全部通过。模板另运行本页的 `--published --frozen-template` 验证，通过后推送默认分支；七个提供方再推送版本标签，核对 Actions、GitHub ZIP 与插件中心状态。只发布 SDK、模板或插件不要求同时发布客户端。
