# 官方插件与模板

本目录的 `tau-plugin-*` 是独立 Git submodule，主仓库固定每个仓库的精确提交，不将源码复制成第二份。`tau-plugin-template` 是统一模板的唯一维护位置；SDK 打包与作者验证直接读取它。

初始化主仓库后执行：

```sh
git submodule update --init --recursive
```

在对应插件目录创建工作分支并修改、测试、提交。先将插件提交推送到其远端工作分支，再在主仓库执行 `git add plugins/<仓库名>` 并提交指针更新；不要只提交主仓库指针而让插件提交仅存在于本机。普通更新使用 `git submodule update --init --recursive` 跟随主仓库锁定的版本，不默认使用 `--remote` 漂移到各仓库最新分支。

每个子仓库维护自己的 package.json、锁文件与 pnpm 配置，不加入主仓库的 workspace 依赖图。修改插件时先阅读该子仓库 AGENTS.md；未发布 SDK 的验证在仓库外副本中注入本地 tarball，不能提交本机路径或把开发 tarball 冒充 npm 已发布版本。

仓库外批量验证使用 `node scripts/plugins/verify-official-authors.mjs <SDK.tgz> <UI.tgz> <报告.json>`，从 `.gitmodules` 读取官方仓库，复制到临时目录后安装、冻结安装、构建与执行已定义测试。模板专项契约验证使用 `scripts/plugins/verify-portable-author.mjs`。

正式 npm 验证使用 `node scripts/plugins/verify-official-authors.mjs --published <报告.json>`：保留各仓 npm 声明与锁文件，在仓库外通过新建 store 冻结安装，不注入本地 SDK。

升级 SDK/UI 时，同步 npm 别名、锁文件和 `pnpm-workspace.yaml` 中自有开发包的 `minimumReleaseAgeExclude` 确切版本，保留其他依赖的发布等待策略。发布后核对 npm 元数据与实际下载摘要，再执行正式冻结安装验证；全部通过后才推送插件发行标签。

推送源码工作分支不等于发布插件。发布标签可能触发插件中心上传；只在明确授权发行时创建标签或执行发布流程。
