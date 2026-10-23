# 发布与更新

模板使用 SDK 0.36.0 与 UI 0.4.0。格式 3 可经工作流上传待审，必须提交每个声明平台的人工验收证据，CI 不会自动批准。移动安装需 Android/iOS 0.2.1 及中心兼容选版；桌面正式客户端仍使用旧格式，格式 3 只供显式桌面开发目录验证。install:local 不把格式 3 写入旧正式目录，不要改格式号绕过限制。

插件写好之后，发布到[插件中心](https://plugins.taunote.app)，用户就能在 Tau 中搜索、安装和更新它。这一篇介绍发布前的准备、第一次发布、之后的版本更新，以及如何升级 SDK。

## 发布前的准备

### 插件详情页的内容

插件中心和 Tau 中的插件详情页，内容都来自插件包本身，不需要在网站上另外填写：

| 显示的内容       | 来自                                                |
| ---------------- | --------------------------------------------------- |
| 名称、简介、版本 | `manifest.json` 的 `name`、`description`、`version` |
| 分类、搜索关键词 | `manifest.json` 的 `categories`、`keywords`         |
| 「说明」         | `README.md`                                         |
| 「更新日志」     | `CHANGELOG.md`                                      |

### README：写给使用者

`README.md` 会原样显示给用户。写清楚三件事：

- 插件能做什么。
- 怎么开始用：在哪里找到入口、需要哪些设置。
- 常见问题：例如需要在第三方服务做的准备、常见的错误提示。

不要写开发过程、内部实现或代码结构，用户不关心这些。

### CHANGELOG：写给使用者

`CHANGELOG.md` 显示在插件详情的「更新日志」里，发布时也会作为 GitHub Release 的说明。

- 每个版本以 `## 版本号` 开头，下面逐条列出。
- 写用户能感知的变化：多了什么功能、修好了什么问题、升级后要注意什么。用界面上的叫法，比如「设置 → 同步」。
- 不写 SDK 版本、构建方式、重构、测试之类的内部变化。确实没有可感知的变化时，写「维护更新，使用上没有变化」。

```markdown
## 1.2.0

- 书架可以按「有笔记」筛选了。
- 修复同步中途断网后，部分划线不显示的问题。
```

### 自查清单

- 在 Tau 中完整试过：启用、使用每项功能、保存数据、停用、重启后再用。
- 申请的权限都是功能需要的，并在 README 中说明了用途。
- 源码和插件包里没有密钥、令牌或你机器上的路径。
- `manifest.json` 和 `package.json` 的版本一致。

## 自动发布

模板自带的 `.github/workflows/release.yml` 会在你推送版本 tag 后自动构建插件，把 ZIP 发布到 GitHub Release，并提交到插件中心。整个过程不需要配置任何密钥。

### 发布一个版本

先修改 `manifest.json` 和 `package.json` 中的版本号并提交，然后打 tag 推送：

```sh
git add manifest.json package.json CHANGELOG.md
git commit -m "chore: release 1.1.0"
git tag v1.1.0
git push origin HEAD
git push origin v1.1.0
```

- tag 可以写成 `v1.1.0` 或 `1.1.0`，必须与两个文件中的版本一致，否则发布失败。
- 只在本地打 tag 不会触发发布，必须推送到 GitHub。
- 仓库需要启用 GitHub Actions，并允许工作流申请 `contents: write` 权限。

工作流会依次：安装依赖、运行 `test` 脚本（如果定义了）、构建，然后把 `dist/<插件ID>-<版本>.zip` 上传到同名的 GitHub Release，说明取自 `CHANGELOG.md` 中对应版本的小节（没有时使用 GitHub 自动生成的提交列表），最后把同一个 ZIP 提交到插件中心。

### 第一次发布

第一次需要在[插件中心](https://plugins.taunote.app)网页上传一次 ZIP 并提交，把插件 ID 绑定到你的 GitHub 仓库。绑定之前，工作流提交到插件中心这一步只会给出提醒，不会让发布失败。

### 之后的版本

绑定后，每次推送 tag，新版本都会自动进入插件中心的审核队列，不需要再打开网页。插件中心通过 GitHub Actions 的身份令牌确认提交来自已绑定的仓库，其他仓库（包括 fork）无法冒充。

- 带[本机后台](backend.md)或 [Skill 脚本](skills.md#附带文件与脚本)的版本会在用户本机执行代码，必须由插件中心人工审核后才会上架，不会自动通过。
- `v1.1.0-beta.1` 这样的预发布版本只发布到 GitHub Release，标记为 Pre-release，不提交插件中心。
- 同一个 tag 重新运行是安全的。同一个版本号换了内容会被插件中心拒绝，需要提高版本号。
- 发布结果和失败日志在仓库的 Actions 页面查看。临时性错误修复后可以重新运行失败的任务；代码有问题时，提高版本号发布新的 tag，不要移动已发布的 tag。

## 用户如何更新

- 用户从插件中心更新插件。新版本在用户下次完全退出并重新打开 Tau 后生效，生效前可以取消。
- 新版本启用失败时，用户可以「恢复上一版」。恢复只换回代码，不会回退数据。

所以改变存储的数据结构时，要让新版本能读懂旧数据，也尽量让旧版本读到新数据时不出错，见[存储与网络](storage-and-network.md#使用要点)。

**插件 ID 永远不要改**。改了 ID，就成了另一个插件：用户需要重新安装，原来保存的数据也读不到。

## 升级 SDK

模板锁定了 `@tau/plugins` 和 `@tau/ui` 的精确版本。需要使用新版 SDK 提供的能力时再升级。

### 1. 允许安装新版本

模板的 `pnpm-workspace.yaml` 启用了 pnpm 的发布时间保护，刚发布的包需要等待一段时间才能安装。把要升级的版本加进 `minimumReleaseAgeExclude`，先保留旧版本的条目：

```yaml
minimumReleaseAgeExclude:
  - "@xiongtao.xt/tau-plugins@0.29.0" # 旧版本，升级完成后再删
  - "@xiongtao.xt/tau-plugins@<新版本>"
```

只为你确认过的版本添加例外，不要关闭整个保护。

### 2. 更新依赖

```sh
pnpm add @tau/plugins@npm:@xiongtao.xt/tau-plugins@<新版本> --save-exact
pnpm install --frozen-lockfile
pnpm build
```

### 3. 清理

构建通过后，从 `minimumReleaseAgeExclude` 中删除旧版本的条目，再运行一次 `pnpm install --frozen-lockfile`。提交 `package.json`、`pnpm-lock.yaml` 和 `pnpm-workspace.yaml`。

各版本的变化见已安装包中的 `node_modules/@tau/plugins/CHANGELOG.md`。

- React 保持模板锁定的版本，它由 Tau 提供，版本不一致可能导致插件无法运行。
- 新能力需要用户的 Tau 版本支持时，同时提高 manifest 的 `minAppVersion`。
- 升级后在 Tau 中重新验证一遍主要功能。

### 同步模板的更新

用模板创建的仓库不会自动跟随模板更新。需要时，对照[上游模板](https://github.com/LastKnightCoder/tau-plugin-template)手动同步 `build.mjs`、`install-local.mjs`、`.github/workflows/release.yml` 和 `docs/`，保留你自己的插件 ID、源码、README 和更新日志。同步前先提交或备份自己的改动。
