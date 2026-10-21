# AI

插件可以调用用户在 Tau 中配置好的大模型。插件拿不到用户的 API Key 和服务地址：请求由 Tau 代为发出，用量记在插件名下，受用户设置的额度约束。

有两种用法：

| 用法                                                | 适合                                                  | 用户需要做什么                   |
| --------------------------------------------------- | ----------------------------------------------------- | -------------------------------- |
| [使用 Tau 已有的模型分配](#使用-tau-已有的模型分配) | 功能和 Tau 某项内置 AI 功能相近，如生成标题、理解图片 | 首次使用时授权                   |
| [自定义 AI 功能](#自定义-ai-功能)                   | 插件特有的功能，需要用户单独选择模型                  | 在插件设置里为功能选择模型并开启 |

大多数插件用第一种就够了，不需要用户额外配置。

## 使用 Tau 已有的模型分配

Tau 的每项内置 AI 功能（对话、标题总结、闪卡制作等）都由用户分配了模型。插件可以申请沿用其中某一项的模型。

### 1. 在 manifest 中声明

```json
{ "permissions": ["ai:titleSummary"] }
```

### 2. 申请并调用

```ts
const model = await context.ai.requestCapability("titleSummary");
const result = await model.chat({
  messages: [{ role: "user", content: "为这段文字拟一个简短的标题：……" }],
});
console.log(result.text);
```

第一次申请时，Tau 会询问用户是否允许。每项能力分别授权，用户可以在插件详情页的「权限」中撤销。

可以申请的能力（也可以从 `PLUGIN_AI_CAPABILITIES` 导入）：

| 能力名                         | 沿用的模型分配 |
| ------------------------------ | -------------- |
| `chat`                         | 对话功能       |
| `titleSummary`                 | 标题总结       |
| `webClip`                      | 网页剪藏       |
| `podcastGeneration`            | 播客生成       |
| `flashcardGeneration`          | 闪卡制作       |
| `aiJudgement`                  | 答案评判       |
| `transcriptionOptimization`    | 转录断句优化   |
| `videoSummary`                 | 视频总结       |
| `videoEbookRewrite`            | 视频电子书重写 |
| `vibeLearningImageDescription` | 图片理解       |
| `contentMetadata`              | 笔记元信息     |
| `contentInsights`              | AI 洞见        |

这里只是借用模型，不会执行 Tau 对应功能的业务流程，也不会自动读取用户数据。提示词和输入由你的插件提供。用户没有为这项能力分配模型时，调用会明确失败，不会自动换成其他模型。

## 自定义 AI 功能

功能和 Tau 已有的能力都不相近时，声明插件自己的 AI 功能。用户在插件详情页的「设置 → AI 配置」中为它选择模型并开启。

```ts
import { definePlugin } from "@tau/plugins";

declare const __PLUGIN_META__: { id: string; name: string; version: string };

export default definePlugin({
  ...__PLUGIN_META__,
  ai: {
    features: [{ id: "summary", name: "文章摘要", description: "概括用户选择的文章" }],
  },
  create: () => ({
    activate(context) {
      context.commands.register({
        id: "summary",
        title: "生成摘要",
        async run(input) {
          const status = await context.ai.getStatus("summary");
          if (!status.configured || !status.enabled) {
            context.ai.openSettings("summary");
            return null;
          }
          const result = await context.ai.chat({
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

`ai.features` 写在插件定义上（静态声明），每项包含 `id`、`name` 和可选的 `description`，最多 32 项。

| 接口                     | 说明                                                     |
| ------------------------ | -------------------------------------------------------- |
| `getStatus(feature)`     | 返回 `{ configured, enabled }`：是否已选模型、是否已开启 |
| `openSettings(feature?)` | 打开插件的 AI 设置，让用户选择模型或开启功能             |
| `chat(request)`          | 一次性返回完整结果                                       |
| `stream(request)`        | 流式返回结果                                             |

调用前先用 `getStatus` 检查，没配置好时用 `openSettings` 引导用户，而不是直接报错。

## 发送请求

两种用法的 `chat` 和 `stream` 参数相同，只是自定义功能需要多传一个 `feature`：

| 字段              | 说明                                                |
| ----------------- | --------------------------------------------------- |
| `feature`         | 只用于自定义功能：插件声明的功能 ID                 |
| `messages`        | 消息数组，`role` 为 `system`、`user` 或 `assistant` |
| `maxOutputTokens` | 可选。最大输出 Token                                |
| `signal`          | 可选。取消信号                                      |

`chat` 返回 `{ text, usage }`，`usage` 包含输入、输出和总 Token 数，模型服务没有报告用量时为 `null`。

### 流式输出

```ts
const controller = new AbortController();
for await (const event of model.stream({
  messages: [{ role: "user", content: article }],
  signal: controller.signal,
})) {
  if (event.type === "text") appendText(event.delta);
  else showUsage(event.result.usage);
}
// 用户点击「停止」时：controller.abort()
```

依次产生 `{ type: "text", delta }`，最后产生 `{ type: "done", result }`。

### 多轮对话与图片

- 多轮对话需要你自己维护历史，把之前的消息一起放进 `messages`。多条 `system` 消息会合并成一个系统提示。
- `user` 消息可以附带图片：`images: [{ data, mimeType }]`。`data` 是不带 `data:` 前缀的 Base64；支持 PNG、JPEG、WebP、GIF，每条消息最多 10 张，整次请求的图片总共不超过 20 MiB。模型本身需要支持图片输入。
- 接口只提供文本生成，不支持工具调用。需要让 Tau 的 AI 助手调用你的功能，使用 [MCP 工具](mcp.md)。

### 取消

传入 `signal` 并调用 `abort()`，或在 `for await` 中提前 `break`，都会取消请求。插件停用、用户撤销授权时，进行中的请求也会被取消。取消无法退回已经产生的模型费用。

## 用量与额度

插件的所有模型调用都记录在 Tau 的「大语言模型 → 用量统计」中，插件设置里的「查看用量」会跳转并筛选出本插件。记录包含时间、模型、状态、Token、估算费用和耗时，不保存提示词和回复内容。

用户可以为插件设置每日请求次数、每日 Token 和并发数上限。达到并发上限时，新请求直接失败，不会排队。

## 错误

错误消息以稳定的代码开头，可以据此给用户合适的提示：

| 代码                    | 含义                   | 建议                 |
| ----------------------- | ---------------------- | -------------------- |
| `AI_NOT_CONFIGURED`     | 没有可用的模型         | 引导用户去设置       |
| `AI_DISABLED`           | 未授权，或插件已停用   | 引导用户授权         |
| `AI_UNDECLARED_FEATURE` | 功能没有声明           | 检查 `ai.features`   |
| `AI_QUOTA_EXCEEDED`     | 今日额度用完           | 提示用户，不要重试   |
| `AI_CONCURRENCY_LIMIT`  | 同时进行的请求太多     | 等当前请求完成后再发 |
| `AI_CONFIG_CHANGED`     | 模型分配在请求期间变了 | 可以重试一次         |
| `AI_ABORTED`            | 已取消                 | 不需要提示           |
| `AI_REQUEST_FAILED`     | 模型服务请求失败       | 显示错误信息         |

通过 `signal` 取消时，也可能抛出标准的 `AbortError`。

遇到额度不足、拒绝授权这类错误后，不要自动循环重试。不要在模块顶层调用 AI；在 `activate` 中也不要等待 AI 请求完成，以免拖慢插件启用。
