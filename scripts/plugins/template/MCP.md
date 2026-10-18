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

需要本地进程时，把 transport 改为下面的结构，命令、参数、工作目录与应用内手动添加 MCP 的含义相同：

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

## 验证

检查类型并打包后，在包含此实现的客户端启用插件：确认两项 MCP 出现在现有页面和快捷面板；测试整项开关、逐工具开关、外部连接配置和重连，再测试停用、重新启用及重启后偏好保留。真实服务器连接与模型调用需使用自己的服务和已配置的模型。
