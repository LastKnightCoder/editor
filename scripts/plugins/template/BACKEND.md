# 本机后台开发

后台入口需要 SDK 0.25.0 及支持包格式 2 的客户端构建。不要只修改版本号就认为客户端已经具备运行能力。普通渲染插件仍使用格式 1。使用 Node 内置模块前执行 `pnpm add -D @types/node@24.0.0 --save-exact` 安装类型声明。

仓库提供完整双入口样本：`scripts/plugins/fixtures/backend-system.tsx` 为界面，`backend-system.ts` 为后台。在宿主仓库运行 `node scripts/plugins/verify-backend-author.mjs`，会打包 SDK，在仓库外安装 tarball、类型检查、构建双入口 ZIP，并用真实 Electron utilityProcess 调用样本。结果位于 `output/plugin-backend-sdk/`；该命令不安装到用户目录、不发布到市场。

在 manifest.json 中将 formatVersion 设为 2，保留 main.js，并增加 backend：

```json
{
  "entry": "backend.js",
  "runtime": "node",
  "apiVersion": 1,
  "scope": "application",
  "activation": "app-ready",
  "lifetime": "persistent",
  "reason": "连接本机设备并向插件页面提供设备状态",
  "systemAccess": ["network"]
}
```

模板从 src/backend.ts 构建独立的 backend.js。Node 内置模块可直接引用，第三方 JS 依赖打入 bundle；仅 @tau/plugins/backend 由宿主提供。不打包 node_modules，不运行安装脚本，不让前端入口引用后台文件。main、后台及样式的摘要由构建生成。

application 作用域支持 on-demand、app-ready；workspace 支持 on-demand、workspace-ready。lifetime 为 idle 或 persistent，常驻直到所属作用域结束。安装不等于启用，声明不等于授权；无授权的自动启动进入等待处理状态。系统用途字段用于用户知情和审核，不是操作系统沙箱。

pnpm build 生成整包 ZIP，pnpm install:local 仍只用于首次开发安装且拒绝覆盖既有目录。后台新版本与界面同包更新，不能只替换 backend.js。

## 定义后台方法

```ts
import { defineBackend } from "@tau/plugins/backend";
import { platform } from "node:os";

export default defineBackend({
  create() {
    return {
      activate(ctx) {
        ctx.rpc.register(
          "system.platform",
          {
            input: {
              parse(value: unknown) {
                if (value !== null) throw new Error("此方法不接受参数");
                return null;
              },
            },
            output: {
              parse(value: unknown) {
                if (typeof value !== "string") throw new Error("平台结果无效");
                return value;
              },
            },
          },
          () => platform()
        );
      },
    };
  },
});
```

渲染入口通过 `await ctx.backend.call("system.platform", null, { signal })` 调用。请求和结果必须为有限 JSON，普通消息最多 1 MiB。后台必须提供输入、输出解析器，异常返回调用方。`ctx.rpc.emit(name, value)` 与 `ctx.backend.subscribe(name, listener)` 用于事件；订阅返回可回收句柄。停用或切库后旧连接失效。

外部程序通过 `ctx.process.run(toolId, args, { signal })` 执行，返回 exitCode/stdout/stderr。同时在 backend.systemAccess 声明 process，并以 backend.tools 列出 `{ id, command, args? }`。参数以数组传递，不自动经过 Shell；stdout/stderr 合计最多 512 KiB，单次执行 30 秒。Windows 只接受可解析到唯一 EXE 的工具，使用宿主 Job Object；Unix 使用进程组监督。需要取消时把 RPC 的 request.signal 继续传给工具。

不要在模块顶层启动任务。计时器、订阅等使用 `ctx.register` 清理；后台长期任务应响应 `ctx.signal`。主进程扫描不会执行后台，客户端会在首次运行前要求本机代码执行授权。独立进程不会限制 Node 对本机文件、网络的实际权限。

插件中心每个后台版本都需人工重点审核，审核者本人的 CI 提交也不自动批准。更新后本机授权重新确认；有在途任务、订阅或插件 MCP 连接时先结束这些工作。已知撤回的中心版本禁止执行；离线只能依据上次已获取的发布状态。原始 stdout/stderr 不写宿主日志，管理页展示有界错误、启动耗时、失败/超时次数及进程资源采样。
