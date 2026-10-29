# 手机本机 AI 运行时验证

验证 `pi-ai@0.87.1 + pi-agent-core@0.87.1` 在无 Node 的 JavaScript 宿主中调用模型协议、执行卡片工具、回传结果并继续推理的能力。本目录是独立验证夹具，不由应用生产入口加载；依赖仅登记在移动端开发依赖中。

## 运行

在仓库根目录执行：

```sh
pnpm --filter mobile validate:ai
pnpm --filter mobile exec tsc --noEmit
```

`validate:ai` 先运行行为测试，再分别使用 esbuild、Vite 生成浏览器包，在没有 `process`、`Buffer`、`require` 的 VM 中执行。VM 仅注入列明的 Web 标准 API，模型请求实际经过本机 HTTP 服务；服务发送按字节分片的协议夹具，不连接真实模型，不使用真实密钥。

产物位于仓库 `output/mobile-pi-validation/`：`report-esbuild.json`、`report-vite.json` 和两个构建器的浏览器包。报告注明模型与原生命令的模拟边界。

## 判据

- OpenAI Chat Completions、OpenAI Responses、Anthropic Messages 三种协议均经过真实 pi-ai 适配器解析，每种完成五轮调用：技能加载、搜索、读取、编辑、回复。
- 技能正文按需进入后续模型请求；这里只验证加载工具模式，不提供通用 `SKILL.md` 目录发现、附件读取或脚本执行。
- 卡片搜索限十条，编辑仅验证向普通本地卡片追加段落；保留读取时的版本、文档和来源身份。
- 集成测试调用实际 `services/tauri.ts` 包装函数，只模拟最下层 `invoke`；检查命令名、条件写入参数和现有字数重算。
- 工具参数错误、缺少读取快照、写入被拒绝、版本冲突、HTTP 401、网络等待取消、收流取消、工具执行取消均须正确结束或返回工具错误。
- 浏览器构建不得包含 `pi-coding-agent`；pi-ai 的 Bun 沙箱环境变量回退保留受条件保护的 `require("node:fs")`，不注入 polyfill，隔离运行须不触发该分支。Vite 对此产生外部化提示。

## 本验证不能证明的能力

VM 运行不是 WKWebView / Android WebView 真机运行。模拟 SSE 不能证明真实提供方、代理地址、鉴权和跨域策略可用。模拟 `invoke` 不代表真实 Rust / SQLite 已完成读写。尚未接入远程 MCP、通用技能导入、密钥存储、原生 fetch 桥或会话持久化。

正式接入还必须处理活动编辑器草稿冲洗、库切换隔离、协作文档的专用写入、查询缓存与正文通知，以及系统后台冻结、断网和重试。取消不能撤销已经提交的数据库事务，不能据此把写入标记为未发生。
