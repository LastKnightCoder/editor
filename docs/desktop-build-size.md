# 桌面端打包体积与产物一致性

本文档说明桌面端安装包的体积构成、两次体积事故的根因，以及当前构建流程中的防护机制。适用于排查"不同机器打出的包大小不一致"或"包体积异常膨胀"的问题。

## 背景：2026-09 体积事故

同一份 v0.53.1 代码，两台 Windows 机器 `pnpm build` 打出的安装包体积差异巨大：

| 机器 | 体积 | 原因 |
| ---- | ---- | ---- |
| 机器 A | 541M | node_modules 被污染，混入全平台原生二进制变体 |
| 机器 B | 220M | node-llama-cpp 未下载 GPU 后端（打包机无可用显卡） |
| 修复后预期 | ~260M | CPU + Vulkan 两个后端齐全，任何机器一致 |

作为参照，引入 node-llama-cpp 之前的版本（v0.40 ~ v0.51）安装包为 162M ~ 175M。

## 正常体积构成（Windows，~260M 版）

未压缩 `win-unpacked` 约 870M，NSIS 压缩后 ~260M：

| 部分 | 大小 | 说明 |
| ---- | ---- | ---- |
| `resources/app.asar` | 224M | 前端产物与纯 JS 依赖 |
| `@node-llama-cpp/win-x64` | 46M | llama.cpp CPU 推理后端 |
| `@node-llama-cpp/win-x64-vulkan` | 95M | llama.cpp Vulkan GPU 推理后端 |
| `@myriaddreamin/typst-*` | 42M | Typst 编译器（仅 win32-x64） |
| `node-llama-cpp`（JS 主包） | 39M | 含 llama.cpp 源码 |
| `@napi-rs/canvas-win32-x64-msvc` | 36M | pdfjs-dist 的原生可选依赖 |
| `@img/sharp-win32-x64` | 19M | 图像处理 |
| Electron 运行时 | ~300M | Tau.exe / locales / dxcompiler.dll 等 |

## 根因一：node_modules 全平台变体污染（+280M）

`@img/sharp-*`、`@myriaddreamin/typst-*`、`@napi-rs/canvas-*` 这类包按平台拆分为多个子包（如 `sharp-linux-x64`、`typst-ts-node-compiler-android-arm64`），正常情况下 pnpm 只安装匹配当前平台的子包。但当 node_modules 因异常安装（如换了 pnpm 版本 / 参数重装）残留**其他平台**的子包时：

- electron-builder 的 `files` 规则 `node_modules/**/*` 会全量复制进包；
- 含 `.node` 二进制的包被自动解包到 `app.asar.unpacked`；
- 原 prune 脚本只删除 darwin 变体（历史上只需要 mac/win 双平台），linux / android / arm 变体全部漏网。

污染时三个目录的体积（正常值见上表）：`@myriaddreamin` 344M、`@napi-rs` 304M、`@img` 190M。

**处理方式**：删除 `node_modules` 后重新 `pnpm install` 即可恢复。`@napi-rs/canvas` 不是直接依赖，而是 `pdfjs-dist`（两处引入，版本不同）的可选依赖，排查时用 `pnpm why @napi-rs/canvas` 确认来源。

## 根因二：llama.cpp 后端依赖打包机显卡（±40M）

node-llama-cpp 的 postinstall 默认 `NODE_LLAMA_CPP_GPU=auto`，会**检测打包机本机显卡**决定下载哪些推理后端：

- 打包机有支持 Vulkan 的显卡 → 下载 CPU + Vulkan 后端 → 包带 GPU 推理（~260M）
- 打包机没有（如 CI runner）→ 只下载 CPU 后端 → **所有终端用户**都失去 GPU 加速（~220M）

注意方向：这不是"适配特定 Windows"——包内后端在用户机器上运行时自动选择（有 Vulkan 设备走 GPU，否则回退 CPU），跨 NVIDIA/AMD/Intel 通用。真正的问题是**产物内容由打包环境决定**，既造成两台机器产物功能不一致，也让 electron-updater 的 blockmap 差量更新失去意义。

CUDA 后端（~510M）刻意不进包：体积约为 Vulkan 的 4 倍且仅服务 NVIDIA。若将来需要覆盖 NVIDIA 高端场景，方向是应用内按需下载后端到用户数据目录，而非增大安装包。

## 防护机制

三个脚本围绕同一份 allowlist 协作，`apps/desktop/scripts/prune-packaged-native-modules.cjs` 导出的 `llamaBackendAllowlistByPlatform` 是**唯一数据源**，不要在其他地方拷贝这份清单：

```
win32:  ["win-x64", "win-x64-vulkan"]
darwin: ["mac-arm64-metal", "mac-x64"]
linux:  ["linux-x64", "linux-x64-vulkan"]
```

### 1. 打包前补拉（run-electron-builder.mjs）

`ensureLlamaCppBackends()` 在启动 electron-builder 前检查 `.pnpm` 中包邻位的后端目录，缺失的以显式 `NODE_LLAMA_CPP_GPU`（`false`=CPU / `vulkan`=GPU）跑一次 `node-llama-cpp postinstall` 补拉，不再依赖本机显卡检测。后端齐全时零开销；首次补拉需下载约 95M 的 Vulkan 后端。

mac 不做补拉：其后端由 arch 决定（arm64 → metal），跨机一致，不存在显卡检测这个变量。

### 2. 打包后断言（verify-native-runtime.mjs）

`pnpm build` 末尾自动执行（也可单独跑 `pnpm --filter desktop verify:native-runtime`），新增两条宿主侧断言，任一失败即终止构建：

- **llama 后端集合断言**：`app.asar.unpacked/node_modules/@node-llama-cpp/` 下的目录集合必须与 allowlist 完全一致（win32/linux）。多了说明打包机 store 带入了 allowlist 外的后端，少了说明产物缺失推理后端。
- **外来平台变体扫描**：遍历 unpacked node_modules 的全部包目录名（含 `@scope/` 二级），凡出现非当前平台 token（linux / android / darwin / arm64 / musl / ia32 等，完整列表见脚本内 `knownPlatformTokens`）即报错并列出具体包名。这是根因一（全平台污染）的直接防线——受污染的 541M 包会在这一步被拦截，无法出门。

断言失败的处理：报错信息会列出违规包名。若为污染（如 `*-linux-*`、`*-android-*`），删除 node_modules 重装后重新打包；若为后端缺失，确认补拉步骤的网络（后端从 GitHub 下载，必要时配置代理）。

## 排查包体积异常

```bash
# 看 unpacked 原生模块的体积分布，前几名超过 100M 基本可判定异常
du -sh apps/desktop/release/win-unpacked/resources/app.asar.unpacked/node_modules/* | sort -rh | head

# 确认某包的依赖来源
pnpm --filter desktop why @napi-rs/canvas

# 确认本地已下载的 llama 后端（邻位目录）
ls node_modules/.pnpm/node-llama-cpp@*/node_modules/@node-llama-cpp/
```

## 维护注意

- 调整进包的 llama 后端（如未来增删 Vulkan）：只改 `prune-packaged-native-modules.cjs` 的 `llamaBackendAllowlistByPlatform`，并在 `run-electron-builder.mjs` 的 `llamaBackendGpuEnv` 中为新后端补上对应的 `NODE_LLAMA_CPP_GPU` 取值，断言与补拉会自动跟随。
- 新增原生依赖后若断言误报，检查脚本内 `knownPlatformTokens` / `allowedPlatformTokensByPlatform` 是否覆盖了该包的平台命名（注意 sqlite-vec 用 `windows` 而非 `win32`）。
- 发布产物体积应稳定在 ~260M（Windows）。若发布机打出 220M 左右的包，说明 Vulkan 后端缺失，属于补拉未生效，不要直接发布。
