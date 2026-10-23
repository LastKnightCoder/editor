# 跨端 SDK 与统一模板验证

## 已发布 SDK 的作者验证

官方模板使用 npm 的插件 SDK 0.36.0 和 UI 0.4.0。在仓库根运行：

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

## 准备模板输入

进入 `plugins/tau-plugin-template`，使用实际生成的文件名：

```sh
node use-local-sdk.mjs ../../../output/plugin-phase-a/sdk/xiongtao.xt-tau-plugins-0.36.0.tgz ../../../output/plugin-phase-a/sdk/xiongtao.xt-tau-ui-0.4.0.tgz
pnpm install
pnpm build
```

tarball 保存在忽略的 `.sdk` 目录，依赖与锁文件只使用相对 file 地址。修改 SDK 导致输入内容变化时更新锁文件；旧锁仍引用已移除依赖而被策略拒绝时，先核对依赖变更，再 `pnpm clean --lockfile` 和重新 install。不要关闭依赖年龄或完整性策略。

产物必须保持 formatVersion 3、portable、web-v1。模板与中心共用 validatePortableDistributionManifest，未知能力、含移动目标的非空权限和插件预发布版本应在构建失败，上一产物保留。install:local 仍拒绝写入旧桌面正式目录；release 工作流可以提交格式 3，但服务端按既有身份与绑定规则决定本人 CI 自动批准或人工审核，平台测试由作者负责。正式发布前只声明实际通过验收且中心已开放的平台，本地构建验证不自动上传。

## 仓库外验证

```sh
node scripts/plugins/verify-portable-author.mjs
```

判据：报告 `output/plugin-phase-a/author-report.json` 为 passed，并包含：

- 独立临时作者目录、中文/空格路径、独立依赖存储；SDK/UI 类型与依赖不解析回仓库。
- 生成新锁并进行冻结安装；作者源码 strict 检查通过，当前仍沿用 skipLibCheck: true。
- 同一模板的页面与编辑器入口都可构建，ZIP 文件与摘要匹配。
- 三端声明、最低版本、必需/可选能力、节点等级校验通过；旧默认校验仍拒绝新格式。
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
