import { definePlugin, type PluginToolRendererProps } from "@tau/plugins";

declare const __PLUGIN_META__: { id: string; name: string; version: string };

function CounterResult({ execution, dataVersion, data, renderDefault }: PluginToolRendererProps) {
  if (execution.status === "executing") return <div>正在读取计数…</div>;
  if (
    execution.status !== "success" ||
    dataVersion !== 1 ||
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    typeof data.count !== "number"
  )
    return renderDefault();
  return (
    <section>
      <strong>已保存计数</strong>
      <p>{data.count}</p>
    </section>
  );
}

export default definePlugin({
  ...__PLUGIN_META__,
  create: () => ({
    async activate(context) {
      if (!context.chat?.registerToolRenderer)
        throw new Error("请升级到支持聊天工具自定义渲染的客户端");
      context.mcp.register({
        id: "counter",
        name: "计数查询",
        tools: [
          {
            name: "read_count",
            description: "读取本插件已保存的计数",
            inputSchema: { type: "object", properties: {}, additionalProperties: false },
            async execute(_args, { signal }) {
              signal.throwIfAborted();
              const saved = await context.storage.get("count");
              signal.throwIfAborted();
              if (saved !== undefined && typeof saved !== "number")
                throw new Error("计数数据格式无效");
              const count = saved ?? 0;
              return { content: `已保存计数：${count}`, render: { version: 1, data: { count } } };
            },
          },
        ],
      });
      await context.chat.registerToolRenderer({
        mcpId: "counter",
        toolName: "read_count",
        component: CounterResult,
      });
    },
  }),
});
