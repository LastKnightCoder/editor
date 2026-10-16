# Tau 插件模板

独立编写、构建并安装 Tau 桌面插件。使用 Node.js 22+ 和 npm，无需克隆客户端仓库。

## 开始

在 GitHub 点击 Use this template 创建自己的仓库，或下载本仓库。然后运行：

```sh
npm install
npm run build
npm run install:local
```

安装目录固定为 `~/.editor/plugins/<manifest.id>/`。打开客户端的插件管理，点击“刷新列表”并启用“独立计数插件”，通过 Ctrl+K 执行“打开独立计数插件”。点击“增加并保存”，停用再启用后计数应保留。启用意图在客户端重启后恢复；计数数据按工作区隔离。

## 编写自己的插件

修改 `manifest.json` 的 id、name、version，以及 package.json 的名称。插件 ID 必须唯一，例如 `yourname.counter`。编辑 `src/index.tsx`；入口默认导出 `definePlugin`，构建自动注入 manifest 的身份信息。不要手写第二份 ID。

`npm run build` 先做类型检查，再生成 CJS、CSS 和 SHA-256 校验信息。发布产物为 `dist/<id>-<version>.zip`，ZIP 内含 `<id>/manifest.json`、`main.js` 和可选 `main.css`。用户可以自行解压到 `~/.editor/plugins/`。

安装脚本直接安装本次 ZIP，目标存在时停止，不覆盖已有插件。更新时先在客户端停用插件，将旧插件目录备份到插件根目录之外，再安装新 ZIP 并刷新列表。当前不提供自动升级、失败回滚或客户端最低版本协议。

## SDK 与兼容范围

API 版本为 1，需要包含固定目录发现功能的 Tau 桌面客户端（C13 及后续实现）。React/ReactDOM 为 19.2.0。npm 上的 `@xiongtao.xt/tau-plugins` 和 `@xiongtao.xt/tau-ui` 通过 npm alias 安装为 `@tau/plugins`、`@tau/ui`；代码导入保持稳定。

这两个 npm 包提供作者类型契约，执行实现由桌面宿主提供。构建必须保留模板中的 external 配置，不能直接在普通 Node.js 中运行 SDK。其他普通 npm 依赖会打包进入 main.js。

详见 [API.md](API.md) 和面向 AI 的 [AGENTS.md](AGENTS.md)。SDK 与本模板采用 MIT 许可。插件市场、上传审核及权限隔离不属于当前模板能力。
