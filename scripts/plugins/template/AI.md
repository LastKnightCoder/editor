# AI 服务

自定义 AI 功能需要 SDK 0.7.0；申请应用已有的模型分配需要 SDK 0.27.0。两者都需要包含对应实现的 Tau 客户端。

自定义 AI 功能由插件声明，用户在插件详情的「设置 → AI 配置」分配已有模型并开启授权。全局「大语言模型」设置管理服务商和密钥；这类功能通过 `ctx.ai` 请求模型，接口不返回密钥、连接地址或用户的聊天历史。

## 使用应用已有模型分配

无需声明 `ai.features` 或另配模型。先在 manifest 中声明 `ai:<能力名>` 权限，再申请对应客户端：

```json
{ "permissions": ["ai:titleSummary"] }
```

```ts
const model = await context.ai.requestCapability("titleSummary");
const result = await model.chat({
  messages: [{ role: "user", content: "为这段文字拟一个简短标题：……" }],
});
console.log(result.text);
```

申请时由用户选择允许或拒绝；能力分别授权，未声明的申请会被拒绝。返回客户端提供 `chat(request)` 和 `stream(request)`，参数与下文自定义 AI 相同，但不传 `feature`。每次调用复核权限，撤权、停用或切库取消在途生成；额度、并发和用量审计按插件统计。缺少应用模型分配时明确失败，不自动选择其他模型。

当前全部 12 项大模型功能分配均可申请，能力清单也可从 `PLUGIN_AI_CAPABILITIES` 导入：

| 能力名                         | 沿用的应用分配 |
| ------------------------------ | -------------- |
| `chat`                         | 对话功能       |
| `titleSummary`                 | 标题总结       |
| `webClip`                      | 网页剪藏       |
| `podcastGeneration`            | 播客生成       |
| `flashcardGeneration`          | 闪卡生成       |
| `aiJudgement`                  | 答案评判       |
| `transcriptionOptimization`    | 转录断句优化   |
| `videoSummary`                 | 视频总结       |
| `videoEbookRewrite`            | 视频电子书重写 |
| `vibeLearningImageDescription` | 图片理解       |
| `contentMetadata`              | 笔记元信息     |
| `contentInsights`              | AI 洞见        |

这里复用模型分配，不自动执行宿主的业务流程或读取业务数据；插件传入自己的消息。已有闪卡业务流程由 `context.flashcards` 提供，它内部调用同一通用机制，需声明 `ai:flashcardGeneration`，详见 [FLASHCARDS.md](FLASHCARDS.md)。

图片理解可在 user 消息中传入 `images: [{ data: imageBase64, mimeType: "image/png" }]`。`data` 不带 data: 前缀；支持 PNG、JPEG、WebP、GIF，每条消息最多 10 张，整次请求的 Base64 总长最多 20 MiB，模型须支持图片。图片与消息正文不会写入用量审计。

## 声明自定义 AI 功能

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
