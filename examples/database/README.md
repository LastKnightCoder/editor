# Database 独立 Web 宿主

此示例仅依赖公开 workspace 包，无桌面别名、Electron 或正文编辑器。使用内存数据演示四种视图、编辑、视图管理、明暗切换和 external 差量更新；刷新后恢复示例数据。

```sh
pnpm --filter @example/database dev
pnpm --filter @example/database build
```

宿主提供 DndProvider、UiProvider、主题初始化与保存回调；CSS 显式扫描 Database 和 UI 源码。Vite 构建检查模块图，宿主运行时依赖回流时直接失败。正文、上传和资源插件未接入，行详情提供通用属性编辑。
