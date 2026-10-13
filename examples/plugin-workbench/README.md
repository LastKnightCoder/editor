# 插件 API 开发样本

这是桌面插件体系的开发验证入口，使用 Node 运行可移植的宿主核心，不启动应用、不读取用户数据库，也不是第三方插件安装器。

```sh
pnpm --filter @example/plugin-workbench check
pnpm --filter @example/plugin-workbench demo
```

`src/plugin.ts` 只从 `@tau/plugins` 导入公开契约，注册保存和读取输入的两个命令。`src/main.ts` 负责显式信任注册、启用、调用、停用、重新启用和断言结果；宿主与插件的依赖分开。

当前存储使用内存适配器，停用后重新启用保留数据，进程退出后丢失。磁盘持久化在 C02-B 增加，不能将本例称为已支持重启恢复。
