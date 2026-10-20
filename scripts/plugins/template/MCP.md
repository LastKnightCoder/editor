# 插件 MCP

通过 `context.mcp.register()` 向 Tau 的 AI 提供工具，一个插件可以注册多个 MCP。它们直接出现在已有 MCP 页面和聊天快捷面板，用户可以整项启停、逐工具启停，不需要插件自行开发管理界面。

需要 SDK 0.11.0 和包含此能力的 Tau 0.59.0 桌面客户端构建。旧客户端没有 `context.mcp`，应检查并明确提示升级；SDK 类型版本不能替代客户端能力检查。

## 本地工具和外部服务器

每次注册填写局部 `id`、`name` 和可选 `description`，再提供 `tools` 或 `transport`，两者互斥。相同插件内 MCP 的 ID 不能重复；不同插件可以使用相同局部 ID。每个 MCP 中的工具名称唯一。

下面是一个完整插件示例。第一项提供本地查询函数；第二项连接外部 MCP，示例地址须替换成真实服务。

```ts
import { definePlugin } from "@tau/plugins";

declare const __PLUGIN_META__: { id: string; name: string; version: string };

export default definePlugin({
  ...__PLUGIN_META__,
  create: () => ({
    activate(context) {
      if (!context.mcp) throw new Error("请升级到支持插件 MCP 的 Tau 客户端");

      context.mcp.register({
        id: "notes",
        name: "我的笔记",
        description: "读取本插件保存的笔记",
        tools: [
          {
            name: "read_note",
            description: "按笔记键读取本插件中的一条笔记",
            inputSchema: {
              type: "object",
              properties: { key: { type: "string", description: "笔记键" } },
              required: ["key"],
              additionalProperties: false,
            },
            async execute(args, { signal }) {
              signal.throwIfAborted();
              if (typeof args.key !== "string") throw new Error("请提供笔记键");
              const note = await context.storage.get(args.key);
              signal.throwIfAborted();
              return { content: note === undefined ? "未找到笔记" : JSON.stringify(note) };
            },
          },
        ],
      });

      context.mcp.register({
        id: "remote",
        name: "外部知识服务",
        transport: { type: "streamable-http", url: "https://your-service.example/mcp" },
      });
    },
  }),
});
```

本地工具填写 `name`、`description`、对象类型的 JSON Schema `inputSchema`，以及 `execute(args, { signal })`。执行结果为 `{ content: string }`，结构化数据可用 JSON.stringify 返回。工具名称使用 1–128 位字母、数字、点、横线或下划线；宿主会生成全局工具名称，作者不要自行拼接命名空间。所有插件工具沿用现有 execute 级审批。

需要本地进程时，先按 BACKEND.md 使用格式 2、独立后台入口及 `systemAccess: ["process"]`，并在 `backend.tools` 声明对应 command 和固定参数前缀。该版本需要系统能力审核和本机后台授权；未声明的旧 stdio 插件需更新，HTTP 和本地 JS tools 不受此要求影响。命令不经过 Shell，工作目录须为绝对路径；环境只包含宿主最小集合与插件显式传入值。Windows 目标必须是 EXE。

例如声明 `tools: [{ id: "mcp", command: "node", args: ["/path/to/your-server.mjs"] }]` 后注册：

```ts
context.mcp.register({
  id: "local-server",
  name: "本地 MCP 服务",
  transport: {
    type: "stdio",
    command: "node",
    args: ["/path/to/your-server.mjs"],
  },
});
```

该片段放在 activate(context) 内，路径须替换。不会自动安装 Node、Python、npm 包或其他依赖，启动前须具备对应运行环境。stdio 支持可选 args、env、cwd；streamable-http 支持可选 headers。不要把密钥、令牌或用户机器路径打进分发包，用户可在 MCP 页面配置本机连接参数。

## 管理和生命周期

- 激活成功后才展示和提供工具；重复启用不会重复登记。激活失败、插件停用、切库或卸载自动回收。
- MCP 页面关闭一项只关闭该项 AI 能力，不停用插件的页面、命令或其他 MCP。用户选择会跨启用和重启保留，重新注册不会强行开启。
- 用户可管理每个工具的开关。插件提供的名称和说明由作者维护；外部服务器支持连接配置、日志和重连，插件函数没有连接配置。
- 返回的 Disposable 可提前注销单项 MCP，无需再交给 context.register。
- 工具调用 signal 在取消、插件停用、整项或对应工具关闭时中止，调用上限为 60 秒。异步代码应响应 signal；取消不能撤销已经完成的写入或外部请求。
- 旧实例、旧数据库和重连前的调用不能转交给新实例。不要缓存上下文到下一次启用。
- Skill 可描述这些工具的用途；ctx.ai.chat/stream 仍是文本生成接口，不会因为注册 MCP 而自动获得工具调用能力。

## 聊天工具自定义渲染

`context.chat.registerToolRenderer` 的类型契约自 SDK 0.15.0 提供，须搭配包含实现的客户端构建。旧客户端即使同为 0.59.0 也可能没有此能力，必须检查方法是否存在；只提高 SDK 类型版本不能替代客户端检查。

在 `async activate(context)` 中，先通过 `context.mcp.register()` 声明工具，再注册组件并 await：

```tsx
await context.chat.registerToolRenderer({
  mcpId: "notes",
  toolName: "read_note",
  component: ({ execution, renderDefault }) =>
    execution.status === "success" ? <div>{execution.output}</div> : renderDefault(),
});
```

这段代码放在异步激活函数内；`mcpId` 是本插件注册 MCP 时的 id，`toolName` 是其中的原始工具名，不拼接全局名称。可以绑定本地工具或本插件 transport 中的远端工具，不能绑定内置工具、其他插件或用户手动添加的服务器。返回 `Promise<Disposable>`，失败随 await 抛出；激活成功后才发布组件，停用或切库自动回收，无需再次 context.register。

本地工具可返回 `{ content: string, render: { version: 1, data: JsonValue } }`；content 提供模型文本及默认展示，render.data 是独立的可持久化展示数据。组件参数为 `PluginToolRendererProps`（从 `@tau/plugins` 导入），包括 execution、isDark、parsedInput、inputParseError、data、dataVersion 和 renderDefault。展示版本为正整数，数据只接受有限 JSON；不支持的版本应调用 renderDefault。

transport 工具当前读取 execution.output，不提供标准 structuredContent 或 MCP Apps HTML 界面能力。宿主决定渲染路由，远端返回不能选择其他渲染器。等待审批继续使用宿主审批 UI，失败和取消显示通用工具行。

关闭 MCP 或工具执行开关不会隐藏历史结果；停用插件时回到通用输入输出，再启用后恢复。组件不应在渲染或挂载时自动执行工具。使用现有 React 和 `@tau/ui`/主题样式，不导入内部聊天包。

完整示例见仓库 `scripts/plugins/fixtures/chat-tool-renderer.tsx`。在宿主仓库执行 `node scripts/plugins/verify-chat-author.mjs`，会生成 SDK 包、在独立目录安装、类型检查并构建该示例 ZIP；不安装到用户目录，也不发布。产物和验收记录保存在 `output/plugin-chat-sdk/`。

## 验证

检查类型并打包后，在包含此实现的客户端启用插件：确认两项 MCP 出现在现有页面和快捷面板；测试整项开关、逐工具开关、外部连接配置和重连，再测试停用、重新启用及重启后偏好保留。真实服务器连接与模型调用需使用自己的服务和已配置的模型。
