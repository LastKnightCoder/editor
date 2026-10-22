# 快速开始

当前模板是跨端开发模板，使用同一个 `@tau/plugins` / `@tau/ui` SDK。开发版本尚未发布到 npm，需要两个本地 tarball，不能用旧公开版本构建新接口。

## 准备与构建

1. 安装 Node.js 22+ 与 pnpm 11.9.0，复制本版本模板到独立目录。
2. 用实际文件路径准备 SDK 输入：

```sh
node use-local-sdk.mjs /path/to/tau-plugins.tgz /path/to/tau-ui.tgz
pnpm install
pnpm build
```

脚本复制到 `.sdk/plugins.tgz`、`.sdk/ui.tgz`。模板依赖显式指向这两个文件，它们仍是公共 SDK/UI 的同一发布包；没有新建移动 SDK。

3. 构建生成 `dist/<插件ID>-<版本>.zip`；再次安装可用 `pnpm install --frozen-lockfile`。
4. 将产物交给明确支持跨端协议的开发宿主验证。当前 install:local 和自动发布拒绝格式 3，不安装到正式客户端或提交生产中心。

本地 tarball 变化后先用 `pnpm install` 更新锁文件，并提交作者项目的 pnpm-lock.yaml；不提交 .sdk、node_modules 或 dist。正式 SDK 发布后再统一切换公开 npm alias 并重建锁文件。

## 模板结构

| 文件                                | 用途                                        |
| ----------------------------------- | ------------------------------------------- |
| manifest.json                       | 身份、平台、版本与能力声明                  |
| src/index.tsx                       | 共用计数器、页面、功能入口、可选设置/Dialog |
| src/styles.css、src/CounterIcon.tsx | 样式和图标                                  |
| build.mjs                           | 依赖检查、清单校验、暂存产物与 ZIP          |
| use-local-sdk.mjs                   | 准备未发布的 SDK/UI 输入                    |
| README.md                           | 给使用者的说明                              |

计数按工作区保存。跨端页面注册与入口分离；设置与 Dialog 仅在宿主提供能力时使用。布局通过 usePluginEnvironment 订阅，不解析 User-Agent。

## 改成自己的插件

1. 修改 manifest 的 id/name/description/version，package.json 版本保持一致。发布后插件 ID 不变。
2. targets 声明实际支持的平台、最低版本、必需/可选能力；没有 Node 不等于移动完整兼容。
3. 共用逻辑和模型，差异明显时拆视图，保持节点类型与字段一致。
4. 更新 README，构建后在目标宿主验收启用、保存、停用与恢复。

契约见[跨端开发](portability.md)，生命周期见[插件组成](plugin-basics.md)。仓库外构建只证明作者闭环，不替代宿主和真机验收。
