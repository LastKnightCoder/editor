# 跨端插件真实宿主校验

## 准备同一插件包

先按 [SDK 与模板指南](/docs/guides/plugin-portability-sdk.md)生成本地 tarball 并完成仓库外构建。再在仓库根运行：

```sh
node scripts/plugins/prepare-portability-validation.mjs output/plugin-phase-a/author-frozen-report.json
node scripts/plugins/serve-portability-validation.mjs
```

判据：output/plugin-portability-validation 生成计数器/ABC ZIP、sources.json、artifacts.json 与 desktop 目录；服务仅监听 127.0.0.1:2430。计数器使用作者报告中的 ZIP；ABC 固定测试版本只补跨端清单，JS/CSS 不改。重新生成产物后重新核对摘要，不混用旧报告。

## 桌面

退出开发应用，再以 TAU_PORTABLE_PLUGIN_DIR 指向上一步 desktop 的绝对路径启动未打包 Electron。该目录只用于本地验证；不要复制到真实用户的生产 plugins 目录。修改 .enabled.json 选择加载的插件后完整重启。

判据：真实侧栏出现计数器入口，点击进入 plugin-page；增加计数后重新打开保留；说明 Dialog 可关闭，离开守卫返回 false 时不能导航；停用后入口失效。ABC 进入普通正文，与独立内容转换使用同一快照。控制台有包错误时排除重复 ID、摘要和能力不兼容，不能改格式号绕过。

可用同一构建产物执行真实桌面 Page 集成测试：

```sh
TAU_PORTABLE_VALIDATION_ARTIFACTS=/绝对路径/output/plugin-portability-validation/artifacts.json pnpm --filter desktop exec vitest run src/features/plugins/__tests__/desktop-plugins.test.tsx
```

## Android 与 iOS

原生验证使用专用应用标识，不覆盖正常 Tau。先检查 SDK/JDK/Xcode 与目标模拟器可用，再在 apps/mobile 依次构建，避免两个 Tauri CLI 共用开发通信状态：

```sh
pnpm exec tauri android build --config src-tauri/tauri.validation.conf.json --apk --debug -t aarch64 --split-per-abi --ci
pnpm exec tauri ios build --config src-tauri/tauri.validation.conf.json --debug --target aarch64-sim --ci
```

Android 安装前执行 adb reverse tcp:2430 tcp:2430，再安装构建报告中的 APK。iOS 使用 simctl install/launch 安装构建报告中的 simulator .app；IPA 导出与签名不是该项判据。只清理专用验证应用的数据，不清用户主应用或其他模拟器数据。

验证构建保留正常 AppShell。首次运行经原生服务下载、暂存、提交并启用两个包，重新加载后依次验证“我的”入口、计数持久化、Dialog 返回、正常卡片正文中的 ABC 源码编辑与保存。结果保存在测试库 plugin_kv 的 validation.host/report，可通过调试通道或只读 SQLite 查询取出到 output；不得把旧报告当作本次结果。

Android 自动正文验证完成后，可执行真实系统返回补测：

```sh
node apps/mobile/scripts/plugin-portability-android-back.mjs
```

判据：report.status 为 passed，两端 sources 的 ZIP 摘要完全相同。完整杀进程再打开后再次查询计数与正文；报告只能证明列出的行为，不能代替真机手感、系统最低版本或商店审核。

## 安装、更新与失败恢复

在普通开发模式的“我的 → 插件管理”粘贴 id/version/url/size/sha256 描述。新包默认停用；启用意图、更新、备份恢复均在下一完整会话生效。待生效更新可以取消。恢复代码不恢复私有数据，作者有不兼容数据迁移时先停止回退并另行处理数据。

检查以下故障判据：

- 摘要、大小、平台或必需能力不符：不求值、不替换 current。
- ZIP 越界、重复条目、链接或超额：拒绝并清 staging。
- 同 ID 并发下载：拒绝第二个任务，不重置第一个任务的取消状态。
- 文件切换中断：switch 日志恢复 current/backup，保留设备启用意图。
- 切库：旧 signal 立即失活，迟到读取/写入不能落到新库。
- 上次模块初始化未完成：下次跳过插件，仍可进入管理停用问题包。运行期同步死循环不能由同线程抢占；开发恢复时用 adb run-as 或 simctl 的应用容器访问，将问题包的 enabled.json 改为 false 后重新启动。

## 自动检查与发行边界

运行 SDK、桌面插件/Page、移动端、公共 UI、编辑器提交守卫、源码组件及博客测试，并执行各包类型检查、Rust 测试、普通 Vite 构建、plugin-process-boundaries 与 check:docs。普通移动产物不得包含 plugin-validation 自动验证、2430 固定来源或 spike 入口；生产中心代码和部署保持不变。

最低系统/WebView、真实软键盘与中文输入、iOS 边缘返回、长按拖拽、平板和长文资源预算由实际设备单独验收。移动搜索只抽取子文本，插件内部源码不纳入索引；这不影响原正文与 Markdown 保真。
