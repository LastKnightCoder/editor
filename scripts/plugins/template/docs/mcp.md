# MCP 工具

通过 `context.mcp.register`，你可以给 Tau 的 AI 助手提供工具。用户和 AI 对话时，AI 会按需调用这些工具，比如查询插件里的数据、在插件里执行操作。

注册的工具会出现在 Tau 的 MCP 页面和聊天的快捷面板里，用户可以整组或逐个开关工具。插件不需要自己做管理界面。

一个 MCP 有两种提供方式：

- **本地工具**：在插件里直接写工具函数，最简单。
- **外部服务器**：连接一个已有的 MCP 服务器，通过 HTTP 或本机进程。

## 本地工具

```ts
context.mcp.register({
  id: "notes",
  name: "我的笔记",
  description: "读取本插件保存的笔记",
  tools: [
    {
      name: "read_note",
      description: "按键读取本插件中的一条笔记",
      inputSchema: {
        type: "object",
        properties: { key: { type: "string", description: "笔记的键" } },
        required: ["key"],
        additionalProperties: false,
      },
      async execute(args, { signal }) {
        if (typeof args.key !== "string") throw new Error("请提供笔记的键");
        const note = await context.storage.get(args.key);
        signal.throwIfAborted();
        return { content: note === undefined ? "未找到笔记" : JSON.stringify(note) };
      },
    },
  ],
});
```

| MCP 字段      | 说明                                      |
| ------------- | ----------------------------------------- |
| `id`          | 局部 ID，一个插件可以注册多个 MCP         |
| `name`        | 显示名称                                  |
| `description` | 可选。说明                                |
| `tools`       | 本地工具列表（与 `transport` 二选一）     |
| `transport`   | 外部服务器的连接方式（与 `tools` 二选一） |

| 工具字段      | 说明                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------- |
| `name`        | 工具名，同一个 MCP 内唯一，规则同[局部 ID](plugin-basics.md#id-规则)。不要自己加插件前缀 |
| `description` | 工具说明。AI 根据它判断什么时候调用，要写清楚用途和适用场景                              |
| `inputSchema` | 参数的 JSON Schema，顶层必须是 `type: "object"`                                          |
| `execute`     | 执行函数，收到参数和 `{ signal }`，返回 `{ content: string }`                            |

- `content` 是给 AI 读的文本。结构化数据用 `JSON.stringify` 转成字符串。
- 参数来自 AI，不一定符合 Schema，使用前要校验。
- 单次调用最长 60 秒。用户取消、关闭工具、插件停用时 `signal` 会中止，异步代码要响应它。取消无法撤销已经完成的写入或外部请求。
- 工具执行前，Tau 会按用户的设置请求确认。

### 和页面上下文配合

如果你的插件有页面，可以用[页面上下文](ui.md#向-ai-提供页面上下文)告诉 AI 用户正在看什么，再用 MCP 工具让 AI 对它执行操作。例如页面上下文提供当前书籍的 ID，工具 `add_note` 接收书籍 ID 和内容。

## 外部服务器

### HTTP

```ts
context.mcp.register({
  id: "remote",
  name: "知识服务",
  transport: { type: "streamable-http", url: "https://your-service.example/mcp" },
});
```

`streamable-http` 支持可选的 `headers`。

### 本机进程

用 stdio 启动本机的 MCP 服务器进程，需要插件带有[本机后台](backend.md)，并在 manifest 的 `backend` 中声明要启动的程序：

```json
{
  "backend": {
    "systemAccess": ["process"],
    "tools": [{ "id": "mcp", "command": "node", "args": ["/path/to/your-server.mjs"] }]
  }
}
```

这里只列出相关字段，`backend` 的完整写法见[本机后台](backend.md)。然后注册：

```ts
context.mcp.register({
  id: "local-server",
  name: "本地 MCP 服务",
  transport: { type: "stdio", command: "node", args: ["/path/to/your-server.mjs"] },
});
```

- `stdio` 支持可选的 `args`、`env`、`cwd`。`cwd` 必须是绝对路径。
- 命令不经过 Shell 执行，参数按数组原样传递。
- 进程的环境变量只包含最小的系统集合和你显式传入的 `env`。
- 在 Windows 上，命令必须能解析到一个 `.exe` 文件。
- Tau 不会替用户安装 Node.js、Python 或其他依赖，启动前需要用户本机已经具备运行环境。在 README 中写清楚要求。

外部服务器的连接配置、日志和重连，用户都可以在 MCP 页面管理。不要把密钥、令牌或你机器上的路径打进插件包，让用户在 MCP 页面里填写。

## 生命周期

- 插件启用成功后，注册的 MCP 才会出现。插件停用、切换工作区或卸载时自动移除。
- 用户在 MCP 页面关闭某个 MCP，只关闭这一组 AI 工具，不影响插件的其他功能。用户的开关选择会一直保留，插件重新注册不会强行打开。
- `register` 返回的 `Disposable` 可以提前移除这个 MCP。

## 自定义工具结果的展示

默认情况下，聊天里的工具调用显示为通用的输入、输出。你可以为自己的工具注册一个 React 组件，把结果显示成卡片、图表等更易读的样子。

### 1. 工具返回展示数据

本地工具除了 `content`，还可以返回 `render`：

```ts
async execute(args) {
  const books = await searchBooks(String(args.query));
  return {
    content: JSON.stringify(books),
    render: { version: 1, data: { books } },
  };
}
```

- `content` 仍然是给 AI 读的文本，也是默认展示的内容。
- `render.data` 是给你的组件用的展示数据，必须是 JSON，会随聊天记录保存。
- `render.version` 是正整数。以后数据结构变化时提高版本，组件按版本处理旧数据。

### 2. 注册组件

在 `async activate` 中，先注册 MCP，再注册组件：

```tsx
await context.chat.registerToolRenderer({
  mcpId: "books",
  toolName: "search_books",
  component: ({ execution, data, dataVersion, renderDefault }) => {
    if (execution.status !== "success" || dataVersion !== 1) return renderDefault();
    return <BookList books={(data as { books: Book[] }).books} />;
  },
});
```

| 字段        | 说明                         |
| ----------- | ---------------------------- |
| `mcpId`     | 本插件注册 MCP 时的 `id`     |
| `toolName`  | 工具的原始名称，不加任何前缀 |
| `component` | 渲染组件                     |

组件收到的属性：

| 属性                             | 说明                                                               |
| -------------------------------- | ------------------------------------------------------------------ |
| `execution`                      | 这次调用的状态和结果，`status` 为 `success` 时 `output` 是结果文本 |
| `data`、`dataVersion`            | 工具返回的 `render.data` 和 `render.version`，没有时为 `null`      |
| `parsedInput`、`inputParseError` | 解析后的调用参数，解析失败时的错误                                 |
| `isDark`                         | 当前是否为暗色主题                                                 |
| `renderDefault()`                | 渲染默认的通用展示                                                 |

- 只能为本插件的工具注册，包括本地工具和本插件外部服务器提供的工具。外部服务器的工具没有 `render`，组件从 `execution.output` 读取结果。
- 遇到不认识的 `dataVersion`、失败或进行中的状态，调用 `renderDefault()`。
- 组件只负责展示，不要在渲染或挂载时自动执行工具。
- 用 `@tau/ui` 组件和主题变量编写样式，与聊天界面保持一致。
- 插件停用后，历史消息回到通用展示；重新启用后恢复。
- `registerToolRenderer` 返回 `Promise<Disposable>`，注册失败时抛出异常。插件停用时自动注销。
