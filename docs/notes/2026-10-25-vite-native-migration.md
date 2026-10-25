# Vite 8 / Rolldown 迁移验证快照

## 范围

基线提交为 TypeScript 迁移后的 `6048588cf`。13 个直接依赖 Vite 的工作区统一使用 Vite 8.3.5；对应构建插件升级为：

| 工具                     | 版本              |
| ------------------------ | ----------------- |
| @vitejs/plugin-react-swc | 4.3.3             |
| @vitejs/plugin-react     | 5.2.0（直接依赖） |
| @tailwindcss/vite        | 4.3.3             |
| vite-plugin-electron     | 1.1.2             |
| WXT                      | 0.21.4            |
| @wxt-dev/module-react    | 1.2.2             |

Vitest 保持 3.2.7，其内部使用 Vite 7.3.1；没有用全局 overrides 强制改变测试框架的内部引擎。

桌面配置改用 `rolldownOptions` 与 Oxc 压缩，旧对象形式 manualChunks 改为五组 codeSplitting。保留页面、worker、preload 入口、外置依赖与 PDF/Tailwind worker 复制。普通 Vite 页面显式保留原浏览器目标，editor-reminder 保留原 Vite 5 的目标；WXT 按其框架构建目标运行。

博客打包脚本直接解析桌面已声明的 esbuild，不再从 Vite 的内部依赖目录寻找它。质量脚本与提交钩子补充 MTS/CTS，覆盖桌面的 Vite 配置。

## 速度观察

Apple M3 Pro、macOS arm64、Node.js v24.21.0，`NODE_OPTIONS=--max-old-space-size=8092`。两次均在 apps/desktop 执行：

```sh
node node_modules/vite/bin/vite.js build --configLoader runner
```

| 版本       | 单次墙钟耗时 | 退出码 |
| ---------- | -----------: | -----: |
| Vite 7.2.4 |    29.773 秒 |      0 |
| Vite 8.3.5 |     6.092 秒 |      0 |

本次观察约快 **4.9 倍**。测量包括页面、主进程与 preload bundle，不包括类型检查、原生模块重编、Electron 封装、签名或公证。各只测量一次，不是多轮中位数，也不代表完整发布流程同比提速。

## 构建与运行验证

- 桌面、移动端、官网、统计网页、插件门户网页、浏览器扩展、Database 示例、Whiteboard 示例、editor-reminder 示例，共 9 个构建目标通过。
- 桌面两个 HTML 入口、主进程入口与四个 worker、preload、复制资源及五组分包存在，HTML 的本地资源引用可以解析。
- 样板间开发服务器用随机本机端口启动，禁止自动打开浏览器；HTML 与 TSX 模块请求成功，服务器正常关闭。
- `verify-plugin-content.mjs --production` 读取真实 dist 入口，在隔离的临时 Electron 工作区验证内容进程；无 Node/业务桥、无插件激活、编解码往返、索引分段和失败恢复通过，7 个真实内容包及 HTML/ABC/TikZ/Typst/custom-block 往返通过。
- 原生语音助手 universal 构建通过。
- electron-builder 生成本地 x64、arm64 两个 `.app` 测试包；使用 ad-hoc 签名、明确关闭本次测试包公证且禁止发布。未产出或上传正式公证发行包。
- `verify-native-runtime.mjs` 对两个架构全部通过：二进制架构、平台依赖裁剪、包内 pi 冒烟（TypeScript 扩展、工具调用、中文路径、JSONL 恢复）、SQLite/向量扩展、Sharp、分词、文档转换、LLM 原生后端、Tailwind、ripgrep 等。
- 桌面、移动端及浏览器扩展 TypeScript 检查通过。
- 主题 48 项、UI 256 项、浏览器扩展 79 项测试通过。
- 质量工具 94 项测试通过，包含 MTS/CTS 显式文件检查；格式、lint、文档与三项边界检查继续执行。

## 已确认的存量问题

移动端全量测试为 889 项通过、2 项失败，均位于 `src/services/__tests__/pluginCenter.test.ts`：最低客户端版本夹具不匹配、旧 required/optional 能力声明断言过期。相关实现与测试相对迁移前没有变更；用原工作区的旧 Vitest/Vite 依赖复跑，出现同样的两个失败。

独立博客包构建被既有边界守护拒绝：编辑器模块图包含 `packages/db-schema/content-metrics.ts`。在进入 Vite CSS 构建之前就失败；使用迁移前脚本与旧 Vite 的 esbuild 依赖复现相同错误。本次没有放宽边界规则，博客独立包不记为构建通过；官网应用本身构建通过。

Vite 8 对 pi 依赖中的 `import.meta.resolve` 输出 CJS 警告。用同一最小输入对照，Vite 7 输出 `(void 0)(name)`，Vite 8 输出 `{}.resolve(name)`，该分支在两者下均不受支持；本次未通过压制警告伪装修复。包内原生 pi 冒烟已通过，但这不表示任意 CJS 打包后的 pi 文件扩展发现分支都可用。

本次不进行视觉验收；Windows、Linux、Android/iOS 原生安装包和正式 macOS 公证发行不在验证结果中。
