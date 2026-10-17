# AI 服务

此能力需要 SDK 0.7.0 及以上，以及支持插件 AI 服务的 Tau 客户端。

插件声明 AI 功能，由用户在插件详情的「设置 → AI 配置」分配已有模型并开启授权。全局「大语言模型」设置管理服务商和密钥；插件只能通过 `ctx.ai` 请求模型，接口不返回密钥、连接地址或用户的聊天历史。

```ts
import { definePlugin } from "@tau/plugins";

declare const __PLUGIN_META__: { id: string; name: string; version: string };

export default definePlugin({
  ...__PLUGIN_META__,
  ai: {
    features: [{ id: "summary", name: "文章摘要", description: "概括用户选择的文章" }],
  },
  create: () => ({
    activate(ctx) {
      ctx.commands.register({
        id: "summary",
        title: "生成摘要",
        async run(input) {
          const status = await ctx.ai.getStatus("summary");
          if (!status.configured || !status.enabled) {
            ctx.ai.openSettings("summary");
            return null;
          }
          const result = await ctx.ai.chat({
            feature: "summary",
            messages: [
              { role: "system", content: "概括主要内容，不添加原文以外的信息。" },
              { role: "user", content: typeof input === "string" ? input : "请先选择正文。" },
            ],
            maxOutputTokens: 1024,
          });
          return result.text;
        },
      });
    },
  }),
});
```

## 接口

| 接口                     | 返回与用途                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `getStatus(feature)`     | `{ configured, enabled }`；模型被删除也视为未配置                                   |
| `openSettings(feature?)` | 打开当前插件设置，由用户分配模型、管理授权                                          |
| `chat(request)`          | `{ text, usage }`；usage 未知时为 null                                              |
| `stream(request)`        | 异步迭代器，依次产生 `{ type: "text", delta }`，最后产生 `{ type: "done", result }` |

请求字段：`feature` 必须是插件声明的功能 ID；`messages` 为 system/user/assistant 文本消息数组；`maxOutputTokens` 是可选的最大输出 Token；`signal` 为可选的取消信号。多轮历史由插件传入。多个 system 消息合并为系统提示，不提供工具调用或自动代理执行。

```ts
const controller = new AbortController();
for await (const event of ctx.ai.stream({
  feature: "summary",
  messages: [{ role: "user", content: article }],
  signal: controller.signal,
})) {
  if (event.type === "text") appendText(event.delta);
  else showUsage(event.result.usage);
}
```

退出迭代、取消 signal、停用插件或用户撤销 AI 授权都会请求取消。不要在模块顶层调用 AI，也不要在遇到额度不足或拒绝授权后自动循环重试。

## 审计与额度

所有模型调用由宿主归属到插件及功能，进入「大语言模型 → 用量统计」，插件设置的「查看用量」会跳转并筛选本插件。记录包含时间、模型、状态、Token、估算费用和耗时，不保存提示词或回复正文。运行中的请求可取消，也可一次关闭插件的 AI 授权。

额度按本机自然日统计，所有窗口共用，并在重启后保留。每日请求次数、每日 Token 和并发限制由用户设置；并发达到上限直接拒绝，不排队。宿主按模型上下文容量加输出上限保守预占 Token，结束后按实际已知用量结算；未知用量保留预占。供应商未报告用量时不能当作零消费；费用为估算，不替代账单。取消无法撤销已经产生的消费。

错误消息以稳定代码开头：`AI_NOT_CONFIGURED`（未配置）、`AI_DISABLED`（未授权或插件已停用）、`AI_UNDECLARED_FEATURE`（未声明）、`AI_QUOTA_EXCEEDED`（每日额度不足）、`AI_CONCURRENCY_LIMIT`（并发已满）、`AI_CONFIG_CHANGED`（模型分配变化）、`AI_ABORTED`（取消）、`AI_REQUEST_FAILED`（模型或审计失败）。本地 AbortSignal 取消也可能抛出标准 AbortError。
