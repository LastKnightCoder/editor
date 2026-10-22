## 简单介绍

基于《卡片笔记盒写作法》的卡片笔记盒管理工具，用于管理卡片笔记盒中的卡片。

## 本地运行

使用 Electron 打包为本地应用。 前端项目使用 `pnpm` 进行包管理，需要全局安装

```Bash
npm install -g pnpm
```

​**然后安装依赖**

```Bash
pnpm install
```

本地运行

```Bash
npm run dev
```

打包

```Bash
npm run build
```

数据存储在 `~/.editor/data.db` 中，请注意备份。

## 项目结构

仓库使用 pnpm workspace 管理，`apps` 下是各个应用（`desktop`、`blog`、`browser-extension`、`mobile`），`packages` 下是共享包（`editor`、`slate-markdown`、`shared`、`db-schema` 等）。桌面应用的前端代码在 `apps/desktop/src` 下，基于 Vite + React；Electron 的代码在 `apps/desktop/src-electron` 下，数据库使用了 sqlite。
