# Whiteboard 独立示例

运行 `pnpm --filter @example/whiteboard dev`，构建 `pnpm --filter @example/whiteboard build`。

示例仅依赖公共包，提供基础文字与绘制、Docker 进程组架构图场景、只读切换、双实例、元素栏、明暗切换和数据下载。通过状态栏创建演示序列，通过右键菜单导出图片；数据仅存在本次会话，没有桌面数据库或业务服务。

构建模块图拒绝桌面源码、Electron 和 SQLite。视觉验收由用户完成。
