# 跨端插件最小验证

## 准备

1. 使用独立 worktree，安装仓库依赖。验证配置为 `apps/mobile/src-tauri/tauri.spike.conf.json`，应用标识与正式客户端不同。
2. 确认 Xcode、iOS Simulator runtime、Android SDK/NDK、JDK 与 arm64 Android 模拟器可用。
3. 使用独立模拟器或确认其空间足够。完整应用 debug APK 包含较大的 Rust 调试库；不要删除已有应用/数据来腾空间。
4. Android/iOS 的 Tauri CLI 构建按顺序执行，避免共享 CLI 选项服务与 Cargo 产物目录相互干扰。

## 本地服务

在仓库根运行：

```sh
VITE_SPIKE_AUTOTEST=1 pnpm --filter mobile dev:plugin-spike
```

服务监听 `127.0.0.1:2420`。不设置环境变量时可点击“运行行为验证”。代码从本地服务下载，主应用包不预装测试插件。

## 桌面

```sh
pnpm --filter desktop exec electron ../mobile/scripts/plugin-spike-desktop.cjs --fresh
```

`--fresh` 使用新的独立 profile；加 `--show` 显示窗口供用户验收。判据：侧栏出现计数器入口，计数保存；ABC 插入、桌面源码编辑、撤销/重做、SVG 与 codec 往返通过；WebView 重载后计数和文档恢复。

## Android

1. 配置 SDK/NDK/JAVA_HOME，启动独立模拟器，用 `adb devices -l` 确认在线，等待 `sys.boot_completed=1`。
2. 首次生成验证工程后运行：

```sh
pnpm --filter mobile exec tauri android init --ci --skip-targets-install --config src-tauri/tauri.spike.conf.json
adb reverse tcp:2420 tcp:2420
pnpm --filter mobile exec tauri android dev --config src-tauri/tauri.spike.conf.json --config '{"build":{"beforeDevCommand":""}}' --host 127.0.0.1 --no-watch
```

3. 复用其他 worktree 构建缓存后若缺少 TauriActivity，清理本 worktree 的对应缓存再重建：`cargo clean --manifest-path apps/mobile/src-tauri/Cargo.toml --target aarch64-linux-android -p tauri`。
4. APK 已生成但安装失败时，确认空间与端口转发，再用 `adb install -r` 安装 `apps/mobile/src-tauri/gen/android/app/build/outputs/apk/arm64/debug/app-arm64-debug.apk`，启动 `com.txiong.tau_plugin_spike/.MainActivity`。
5. 进程级恢复使用 `adb shell am force-stop com.txiong.tau_plugin_spike` 后重新启动。只对专用验证应用清数据，不操作正式 Tau 数据。

判据：移动功能列表入口、源码面板、返回仲裁、计数/正文恢复通过，报告 nativeContainer 为 tauri。返回仲裁通过不等于真实触摸手势与视觉已经验收。

需要验证真实系统返回键时，在自动验证结束后运行 `ANDROID_HOME=<SDK目录> node apps/mobile/scripts/plugin-spike-android-back.mjs`。脚本通过 WebView 调试协议打开计数器说明，再发出 `adb input keyevent 4`，断言浮层关闭而页面保留；它不读取截图。

## iOS

1. 用 `xcrun simctl list runtimes` 和 `xcrun simctl list devices available` 确认模拟器，没有运行时先通过 Xcode 安装。
2. 首次生成验证工程，再运行指定模拟器；设备名替换为本机名称：

```sh
pnpm --filter mobile exec tauri ios init --ci --skip-targets-install --config src-tauri/tauri.spike.conf.json
pnpm --filter mobile exec tauri ios dev 'Tau Plugin Spike' --config src-tauri/tauri.spike.conf.json --config '{"build":{"beforeDevCommand":""}}' --host 127.0.0.1 --no-watch
```

3. 如果模拟器 BUILD SUCCEEDED、随后 archive 的 CLI WebSocket 连接失败，可以用 `xcrun simctl install` 安装本次日志中 `debug-iphonesimulator/Tau Plugin Spike.app`，再用 `xcrun simctl launch <设备ID> com.txiong.tau-plugin-spike` 启动；不得描述为成功生成分发包。
4. 用 `xcrun simctl terminate <设备ID> com.txiong.tau-plugin-spike` 后重新 launch 检查进程级持久化。仅在需要清空测试数据时卸载专用标识。

判据同 Android，报告 nativeContainer 为 tauri。iOS 经本地开发资源代理回传报告，不需要修改正式应用 ATS 配置。

## 结果与回归

- 各平台应有 `phase-one-passed` 和后续 `passed` 报告，路径为 `output/mobile-plugin-spike/`；启动、构建成功或单独看到 SVG 不算整轮通过。
- 三端 artifacts 数组中的 ID、版本、JS/CSS 摘要必须相同。
- 首次验证写入/编辑，有 checkpoint 时验证恢复；重跑首次流程只清专用 profile/验证应用数据。保留失败报告以便定位。
- 浏览器、Electron、Android WebView、iOS WKWebView 分别记录，不相互替代。

```sh
pnpm --filter @tau/plugins test
pnpm --filter mobile exec vitest run src/plugin-spike/runtime.test.ts src/services/__tests__/editor-boundary.test.ts src/features/cards/__tests__/editorElementCoverage.test.ts src/router/core/__tests__/stackMachine.test.ts
pnpm --filter mobile build:plugin-spike
pnpm --filter mobile build
pnpm check:plugin-process-boundaries
pnpm check:docs
```

普通 `apps/mobile/dist` 中不应包含 `spike.counter`、`data-spike-` 或 `__plugin-spike__`。产物、模拟器工程和 profile 不入库。结束后停止本次专用 Electron、Vite 服务和模拟器，不关闭用户原有会话。
