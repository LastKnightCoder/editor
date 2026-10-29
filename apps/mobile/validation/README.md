# 移动端验证工具

本目录只承载测试驱动、插件样例与断言，不属于生产宿主。访问本应用源码使用 `@/`，本目录入口使用 `@validation/`；插件作者工程只能依赖公开 SDK。

- `host/`：在正常 AppShell 中操作独立验证应用的真实安装、页面、编辑器和数据库，仅由 `plugin-validation` / `plugin-center-validation` 模式加载。
- `ai/`：独立的 pi-ai / pi-agent-core 浏览器打包、协议流和本机工具循环验证，使用 `pnpm --filter mobile validate:ai` 运行，不接入生产入口。
- 测试报告和临时产物放仓库 `output/`。模拟器仅使用专用应用标识，不清理正式应用数据。
- `plugin-validation` 可显式设置 `TAU_PLUGIN_VALIDATION_SOURCE_URL` 从测试服务读取包清单，更新插件后只需重新安装包，无需为测试数据重编译原生应用；每份下载仍校验指定大小与摘要。未设置时读取构建时的验证清单，失败不静默回退。

普通构建必须不包含样例正文、具体验证插件 ID 和自动执行器。验证工具可以知道样例插件；生产运行时只能消费插件声明，不能按具体插件 ID 分支。
