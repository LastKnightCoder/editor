# 移动端冒烟测试报告与调试经验（2026-09）

> 背景：mobile 端完成页面栈架构重写（router 框架层 + definePage 页面协议 + 数据层接入
> TanStack Query，见提交 0727d0fb / 4d03140d / fccc6848 / fa669690）。本文记录重写后的
> 首轮真机级冒烟测试：发现并修复 2 个 P0、遗留疑似问题清单、可复用的调试方法论，
> 以及 Windows 验证机上的环境搭建与平台专属踩坑（双平台经验合并版）。

## 测试环境

| 项       | macOS 验证机                                                       | Windows 验证机                                                                    |
| -------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 设备     | Android 模拟器 `Medium_Phone_API_36.1`（arm64），内存最终调至 4GB  | Android 模拟器 `medium_phone`（android-36 playstore x86_64，i7-13700KF/64GB）     |
| 开发部署 | `pnpm dev:android`（tauri android dev，vite dev server）           | 验证期间走 W-4 应急流程（符号链接限制）；后已开开发者模式，原生命令可用           |
| 对照部署 | `pnpm build:android:test` 独立 APK（前端打包、无 dev server 依赖） | 同左（Windows 侧出了 x86_64 / aarch64 release APK，见「Windows 验证结论与产物」） |
| 静态检查 | `tsc --noEmit` 通过；vitest 38 文件 / 174 用例全过                 | 同左，174 用例全过                                                                |

未连接 Android/iOS 真机（adb / devicectl 均无设备），全部结论来自模拟器。
**dev 端口已从 1420 统一改为 2420**（Windows 的 Hyper-V 动态保留端口段覆盖 1346-1547，
1420 无法绑定；2420 双平台均可用，见 W-3）。

## 调试方法论沉淀

### 1. WebView 应用的 CDP 直连诊断（强烈推荐）

`adb shell` + screencap 只能看表象，CDP 才能看真相。dev 与 debug 构建均可连：

```Bash
ADB=~/Library/Android/sdk/platform-tools/adb
PID=$($ADB shell pidof com.txiong.tau_mobile | tr -d '\r')
$ADB forward tcp:9222 localabstract:webview_devtools_remote_$PID
curl -s http://127.0.0.1:9222/json   # 取 webSocketDebuggerUrl，用 ws 库直连
```

高频用法（Runtime.evaluate）：

- `document.body.innerText` / `#root` innerHTML —— DOM 真实状态（**innerText 只含可见
  文本，元素被隐藏时查 outerHTML**）；
- 直接 `window.__TAURI_INTERNALS__.invoke("bootstrap_app")` —— 绕过 UI 测 Rust 命令
  耗时与返回值，快速区分前端/后端问题；
- 遍历 `document.querySelectorAll("button")` 取 `getBoundingClientRect()` 中心坐标 ×
  `devicePixelRatio` 换算物理坐标，再 `adb shell input tap` —— 比"看截图估坐标"可靠得多。

Windows 补充（Git Bash）：

- `ADB="$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"`；
- Rust 侧 `eprintln!` 以 `RustStdoutStderr` tag 进 logcat，可当运行时打点判断命令
  是否真的执行（`adb logcat -s RustStdoutStderr`）；
- `Page.addScriptToEvaluateOnNewDocument` 可在应用代码执行前注入探针（包
  `__TAURI_INTERNALS__.invoke` 记录每次调用的发起/返回时间线），适合排查初始化竞态；
- **图省事的坑**：经 CDP 用 `import('/src/xxx.ts')` 动态加载 dev 模块会撞上
  "代理停摆"（见 S 表 Windows 补充），用 `fetch('/src/xxx.ts').then(r=>r.text())`
  看转换产物即可。

**注意**：CDP attach 本身可能影响被测进程（S1 的 3/4 次死亡紧随 attach 之后），对内存
敏感场景要用"无 CDP 的对照轮"交叉验证。

### 2. 截图分析的坑：帧 ≠ 真相

`screencap` 抓的是合成帧。本次多次出现"截图显示 A、DOM 实际是 B"（过渡动画帧、首帧
合成缺失、渲染进程卡死时的最后合成帧）。**图像分析结论必须与 DOM/console 交叉印证**，
单独采信任何一侧都会误判。

### 3. 环境变量先于代码归因

两次"应用死亡"最终都与代码无关：第一次是模拟器存储不足（`INSTALL_FAILED_INSUFFICIENT_
STORAGE`，452MB debug APK），第二次是 2GB 内存被 lmk 连环击杀（渲染进程 OOM 2.7GB）。
模拟器上跑 debug 构建的准备工作：

- `adb shell df -h /data` 确认空间（不足时卸旧包 + `pm trim-caches`）；
- 用 `-memory 4096` 启动模拟器（默认 2GB 对 452MB debug APK + WebView 太小）；
- 模拟器是共享环境，Google 系后台应用也在抢内存，"间歇性死亡"先查
  `logcat -b all | grep -iE "lowmemorykiller|Render process"`。

### 4. 归因要用数据闭环，警惕"常数巧合"

"卡了 ~35 秒"与代码里 `SYNC_CHECK_TIMEOUT_MS = 35_000` 的巧合极具迷惑性。最终靠
logcat 时间戳把启动耗时拆解到各阶段（Rust 2s / DCL 1.2s / 其余为前端执行）才完成
修正。**看到"数值对得上"先当作假设，用分阶段计时验证。**

### 5. 对照实验设计：dev 依赖剥离

dev 模式混入了 vite HMR、CDP、React DevTools 等变量。排查"疑似应用 bug"时，构建
`build:android:test` 独立 APK 跑同一操作序列，是一次性剥离全部 dev 工具链变量的最干净
对照实验。

## 冒烟测试操作手册（可复用）

1. **静态**：`pnpm --filter mobile exec tsc --noEmit` + `pnpm --filter mobile test`；
2. **部署**：`pnpm dev:android`（迭代期）或 `build:android:test` 独立 APK（终验）；
   Windows 需先开开发者模式（W-4b），无权限机器按 W-4 应急流程操作；
3. **启动自检**：console 无 `[pages]`/`[router]` 警告；RouterDevTools 悬浮球 `⌗ ≥ 1`；
4. **核心链路**（每步确认进程存活 + 截图留档）：

- 卡片首页列表/空状态；
- 页面栈：任务/日记/设置 push → root 层交互隔离（底部工具栏在非根页应失效）→
  系统返回键逐层 pop；
- 待办：创建 → 完成切换 → 列表实时刷新（query 订阅化 store）；
- 日记：月历 → SnapSheet → Slate 编辑器输入 → 返回后"最近记录"更新
  （验证 refetchOnResume）；
- 设置：渲染 + 主题切换（深色）；
- 卡片：快速捕获输入 → 保存 → 列表更新；**杀进程重启后数据仍在（真实落库）**。

5. **验收基线**（独立 APK，4GB 模拟器）：全新安装首启主界面 ~15s、二次启动 ~3s、
   连续操作 12 分钟无崩溃。

## Windows 环境搭建与专属踩坑（W 系列）

Windows 验证机基线：Win11 / i7-13700KF / 64GB / JDK 23（`C:/Program Files/Java/jdk-23`，
勿用 Android Studio JBR 25——Gradle 8.14.3 支持上限更低）/ Android SDK 含 NDK 30 /
Rust 1.98.1。

### 环境准备（一次性）

**已写入用户级环境变量（2026-09-10，永久生效，无需管理员）**：`JAVA_HOME` /
`ANDROID_HOME` / `NDK_HOME`（注意 NDK 固定版本号，升级 NDK 后需手动改），
用户 PATH 追加了 JDK bin（keytool，W-9）、platform-tools（adb）、emulator。
代理变量刻意**不**写入系统（代理失效会拖垮全局网络；Gradle 代理固定在
gitignored 的 `gen/android/gradle.properties`，rustup 装目标时临时 export 即可）。
注意：从旧终端会话里再开子进程不会继承新变量，**新开终端**（开始菜单/资源管理器
启动）才生效。

```Bash
# 必需环境变量（建议写入系统）
export JAVA_HOME="C:/Program Files/Java/jdk-23"
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/30.0.16248370"
# 需要代理时（rustup/gradle 不读 git 的 proxy 配置）
export HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897

rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
npx tauri android init   # 生成 gen/android（已 gitignore；生成后为 gradle.properties 配代理）
```

模拟器（AVD `medium_phone`）：

```Bash
"$ANDROID_HOME/cmdline-tools/latest/bin/android.exe" emulator create medium_phone
"$ANDROID_HOME/emulator/emulator.exe" -avd medium_phone -no-snapshot-load &
```

### 专属踩坑清单

- **W-1 rustup 证书过期报错**：rustup 不走 git 代理，直连 rust-lang.org 失败报
  `invalid peer certificate: Expired`——执行前显式 `export HTTPS_PROXY/HTTP_PROXY`。
- **W-2 sdkmanager 包名被拆散**：Git Bash 调 `.bat` 经 cmd 中转，**cmd 把 ****`;`**** 当参数
  分隔符**，`sdkmanager.bat "system-images;android-37;..."` 报一堆 `Package xxx not found`
  （`MSYS2_ARG_CONV_EXCL` 也拦不住）。改用原生 `android.exe`：
  `android.exe sdk install "platforms;android-36"`；建 AVD 同理用
  `android.exe emulator create`（老 `avdmanager.bat -k "a;b;c"` 同样会踩）。
- **W-3 dev 端口 1420 被 Hyper-V 保留**：`netsh interface ipv4 show excludedportrange
protocol=tcp` 可见保留段覆盖 1346-1547，vite 绑定即 `EACCES`（任何 IP）。已全局改
  **2420**（`vite.config.ts` + `tauri.conf.json`，HMR 2421）。有管理员权限的替代方案：
  `net stop winnat` → `netsh int ipv4 add excludedportrange ... store=persistent` →
  `net start winnat`。
- **W-4（核心）符号链接权限**：Windows 创建符号链接需开发者模式或管理员；Tauri CLI
  把 `.so` 符号链接进 `gen/android/app/src/main/jniLibs/<abi>/` 时直接失败终止（Gradle
  的 `rustBuild*` 任务会回调 Tauri CLI，直跑 gradlew 也一样失败）。**根治见 W-4b**。
  无权限机器的应急流程（当时用于完成验证，未沉淀为脚本——避免与原生命令双路径漂移）：

  1. 自设 NDK 交叉编译环境后直跑 cargo：
     `CARGO_TARGET_<TRIPLE>_LINKER=<NDK>/toolchains/llvm/prebuilt/windows-x86_64/bin/<triple>24-clang.cmd`
  - `AR/CC/CXX_<triple>`（详见 W-9 同款 PATH 处理）；
  2. **复制**（非符号链接）`target/<triple>/(debug|release)/libmobile_lib.so` 到
     `gen/android/app/src/main/jniLibs/<abi>/`——注意目录名是 **ABI**（arm64-v8a /
     armeabi-v7a / x86 / x86_64），不是 Gradle flavor 名（W-11）；release 需加
     `--features tauri/custom-protocol` 让前端资源内嵌；dev 需按 W-7 覆盖 devUrl；
  3. 跑 Gradle 并跳过回调 Tauri CLI 的任务：
     `gradlew install<Flavor>Debug / :app:assemble<Flavor>Release -x rustBuild<Flavor><Profile>`；
  4. release 另需先过签名（W-9/W-10）。

- **W-4b 开发者模式开启方法（根治符号链接限制）**：

  - 设置界面：`Win + I` → **系统 → 开发者选项** → 打开「开发人员模式」开关，UAC 确认
    （无需重启，对新进程立即生效，整机持久）；
  - 注册表等效（管理员 PowerShell）：
    `reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /t REG_DWORD /f /v "AllowDevelopmentWithoutDevLicense" /d "1"`；
  - 验证：新开终端执行 `cmd /c "mklink test_link C:\Windows\explorer.exe"`，提示
    「已为 test_link 创建符号链接」即成功（`del test_link` 清理）；
  - 开启后原生 `pnpm dev:android` / `pnpm build:android:release` 全链路可用；
    CI 的 Windows runner 本身是管理员权限，同样无需开发者模式。
  - **已实测（2026-09-10）**：开启开发者模式后原生 `pnpm build:android:release`
    一次通过（symlinking 步骤正常、签名正常、产物 `app-arm64-release.apk`）。
    原生流程仍需注意 W-9（keytool 要在 PATH）与 W-12（先停 dev server 再
    `pnpm build`）及代理环境变量。

- **W-5 追加 gradle.properties 粘连**：原文件末尾无换行，`cat >>` 后两行合并导致
  `Cannot parse project property ... as boolean`。追加前先补换行。代理配置：
  `systemProp.http(s).proxyHost/Port=127.0.0.1/7897`（写在 gitignore 的
  `gen/android/gradle.properties`）。
- **W-6 vite 只监听 IPv6**：Windows 上 vite `host:false` 只绑 `[::1]`，IPv4 `127.0.0.1`
  全拒。需要本机回环访问时 `pnpm dev --host 127.0.0.1`。
- **W-7 模拟器访问宿主机 dev server**：`adb reverse` 在该环境不可靠（注册成功但流量
  不通，WebView 报 `ERR_ADDRESS_UNREACHABLE: bogus message from tcp peer`）。统一走
  **LAN IP 直连**：vite 监听 `TAURI_DEV_HOST=<LAN-IP>`，App 的 `devUrl` 用
  `TAURI_CONFIG='{"build":{"devUrl":"http://<LAN-IP>:2420"}}'` 编译期覆盖（devUrl 是
  编译期嵌进 .so 的）。
- **W-8 探测 LAN IP 的坑**：`Get-NetIPAddress | Select -First 1` 可能选中 WSL/Hyper-V
  虚拟网卡（172.26.x.x，模拟器不可达）；且 WMI 查询在个别机器**挂起数十分钟**。用
  `route print -4 0.0.0.0 | awk '/^ *0\.0\.0\.0 *0\.0\.0\.0/ {print $4; exit}'`
  （默认路由网卡，毫秒级）。
- **W-9 keytool 不在 PATH**：Windows `javapath` 只有 java.exe 等少数入口。签名脚本已
  迁移为 `prepare-android-signing.mjs`（Node 实现，postinstall 不再依赖 bash，避免
  Windows 把 `bash` 解析到 WSL 存根导致安装失败），会依次探测 PATH、`JAVA_HOME/bin`、
  Android Studio `jbr/bin` 下的 keytool，无需再手动配 PATH。旧 bash 版需要把
  `${JAVA_HOME}/bin` 加进 PATH，且必须用 `cygpath -u` 转成 `/c/...` 风格（MSYS 的 PATH
  按冒号分隔，`C:/` 前缀会被拆坏）。
- **W-10 keystore 路径必须是 Windows 风格**：旧 bash 版把 `$HOME`（MSYS `/c/Users/...`）
  写进 `keystore.properties` 的 `storeFile`，Gradle `file()` 解析失败 → 产出 unsigned APK
  （产物名带 `-unsigned`）。Node 版脚本用 `os.homedir()`（原生 `C:\Users\...`），写入
  properties 时统一转成正斜杠（Java properties 会把 `\` 当转义符），默认路径已无此
  问题；手动注入 `TAURI_ANDROID_KEYSTORE_PATH` 时仍需给 `C:/Users/...` 风格。
- **W-11 flavor 名 ≠ ABI 目录名**：Gradle flavor 叫 `arm64`，jniLibs 子目录必须用 ABI 名
  `arm64-v8a`（armeabi-v7a/x86/x86_64 同理；x86_64 恰好同名最易误判），否则
  `mergeArm64ReleaseNativeLibs` 报 `out ... is not an ABI`。改对后旧目录残留同样报错。
- **W-12 vite build 报 EBUSY rmdir dist/assets**：**仍在运行的 vite dev server watcher
  持有 dist 句柄**。跑 `pnpm build` / release 前先停 dev server。
- **W-13 模拟器 adb install 偶发慢**：AGP 对模拟器安装有 ~50s×3 的重试，属模拟器 IO 慢，
  非构建问题；频繁失败可 `adb install -r <apk>` 直装。
- **W-14 local.properties 转义**：`sdk.dir` 用反斜杠会被 properties 转义吃掉（报"文件名
  语法不正确"），用正斜杠 `C:/Users/pc/AppData/Local/Android/Sdk`。

## Windows 验证结论与产物

Release（全新安装）回归全部通过：首启自动初始化 `~/.editor/setting.json + data.db +
data.index.db`；首页/快速捕获/保存/**杀进程重启数据仍在**/任务/日记（2026-09 日历正确）/
我的，中文显示正常；174 单测全绿。产物（V2 签名验证通过，keystore 在
`~/.editor-mobile-signing/`）：

```
apps/mobile/src-tauri/gen/android/app/build/outputs/apk/x86_64/release/app-x86_64-release.apk   # 模拟器
apps/mobile/src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk    # 真机
```

## 相关提交

- 修复 P0-1 / P0-2：见 `apps/mobile/src/app/AppShell.tsx`、`apps/mobile/src/pages.ts`
  的本次修复提交（共 13 行改动）。
- Windows 验证机补充（dev 端口 2420、`bootstrapApp` 超时重试、本文档 W 系列）：
  见后续提交。
