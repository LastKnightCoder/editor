## 简单介绍

基于《卡片笔记盒写作法》的卡片笔记盒管理工具，用于管理卡片笔记盒中的卡片。

## 本地运行

使用 Electron 打包为本地应用。 前端项目使用 `pnpm` 进行包管理，需要全局安装

```bash
npm install -g pnpm
```

然后安装依赖

```bash
pnpm install
```

本地运行

```bash
npm run dev
```

打包

```bash
npm run build
```

数据存储在 `~/.editor/data.db` 中，请注意备份。

## 项目结构

`src` 下是前端的代码，基于 Vite + React。`src-electron` 下是 Electron 的代码，数据库使用了 sqlite。
