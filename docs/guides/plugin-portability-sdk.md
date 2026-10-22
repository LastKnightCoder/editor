# 跨端 SDK 与统一模板的本地验证

## 生成 SDK

在仓库根运行：

```sh
node scripts/plugins/package-sdk.mjs output/plugin-phase-a/sdk
```

判据：生成插件 SDK 与 UI 两个 tgz；插件 SDK 包版本为当前 `packages/plugins/package.json` 的开发版本。仅打包，不执行 npm publish。

## 准备模板输入

进入 `scripts/plugins/template`，使用实际生成的文件名：

```sh
node use-local-sdk.mjs ../../../output/plugin-phase-a/sdk/xiongtao.xt-tau-plugins-0.36.0-dev.0.tgz ../../../output/plugin-phase-a/sdk/xiongtao.xt-tau-ui-0.3.0.tgz
pnpm install
pnpm build
```

tarball 保存在忽略的 `.sdk` 目录，依赖与锁文件只使用相对 file 地址。修改 SDK 导致输入内容变化时更新锁文件；旧锁仍引用已移除依赖而被策略拒绝时，先核对依赖变更，再 `pnpm clean --lockfile` 和重新 install。不要关闭依赖年龄或完整性策略。

产物必须保持 formatVersion 3、portable、web-v1。`install:local` 与 release 工作流应该拒绝此格式；不得将其复制进真实用户插件目录或上传生产中心。

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

仓库外报告不证明正式壳、真机交互或应用商店审核；这部分由后续接入工程验证。新 SDK/模板当前不发布。
