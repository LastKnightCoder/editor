import { RpcMessageType, RpcRequestMessage, RpcResponseMessage } from "@/types";
import BackendWebSocketServer from "../utils/BackendWebSocketServer";
import fetch from "node-fetch";
import log from "electron-log";
import { Descendant } from "slate";
import { importFromMarkdown } from "@/utils/markdown";
import databaseManager from "./database";
import ContentTable from "./tables/content";
import WebClipTable from "./tables/web-clip";
import ContentLinkTable from "./tables/content-link";

interface WebClipStartPayload {
  projectItemId: number;
  html: string;
  url: string;
  title: string;
  translateToChinese: boolean;
  // LLM 配置
  apiKey: string;
  baseUrl: string;
  modelName: string;
}

interface WebClipTask {
  projectItemId: number;
  url: string;
  title: string;
  abortController: AbortController;
  status: "processing" | "completed" | "error" | "cancelled";
  accumulatedMarkdown: string;
}

/**
 * 生成 HTML 转 Markdown 的系统提示词
 * @param pageUrl 页面 URL，用于处理相对路径
 * @param translateToChinese 是否翻译为中文
 */
const buildConvertPrompt = (pageUrl: string, translateToChinese: boolean): string => {
  // 从 URL 提取 baseUrl（协议 + 域名）
  let baseUrl = "";
  let baseDir = "";
  try {
    const urlObj = new URL(pageUrl);
    baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    // baseDir 是页面所在目录（去掉最后的文件名部分）
    const pathParts = urlObj.pathname.split("/");
    pathParts.pop(); // 移除最后一段（可能是文件名）
    baseDir = `${baseUrl}${pathParts.join("/")}/`;
  } catch {
    baseUrl = pageUrl;
    baseDir = pageUrl;
  }

  const translationRule = translateToChinese
    ? `
### 5. 语言翻译
- **翻译为中文**：将所有非中文内容翻译为简体中文
- **保持专业术语**：技术术语可保留英文原文，在括号中注明
- **代码不翻译**：代码块中的内容保持原样，仅翻译注释`
    : "";

  const outputLanguage = translateToChinese ? "\n- 输出语言为简体中文（代码除外）" : "";

  return `# 任务说明

你是一个专业的网页内容提取助手。你的任务是将 HTML 代码转换为结构清晰的 Markdown 文档。

## 页面信息

- **页面地址**: ${pageUrl}
- **基础 URL**: ${baseUrl}
- **当前目录**: ${baseDir}

## 转换规则

### 1. 内容提取
- **完整保留**：提取 HTML 中的所有正文内容，不要总结或缩写
- **过滤噪音**：忽略广告、推荐、导航栏、页脚等与正文无关的内容
- **保持结构**：保留原有的标题层级、段落、列表等结构

### 2. 资源链接处理
将所有相对路径的资源（图片、链接、视频、音频等）转换为绝对路径：

| 相对路径格式 | 转换规则 | 示例 |
|------------|---------|------|
| \`//example.com/img.png\` | 添加协议 → \`https://example.com/img.png\` | |
| \`/path/to/img.png\` | 添加基础 URL → \`${baseUrl}/path/to/img.png\` | |
| \`./img.png\` 或 \`img.png\` | 添加当前目录 → \`${baseDir}img.png\` | |
| \`../img.png\` | 根据当前目录计算上级路径 | |

### 3. 懒加载资源
很多网页使用懒加载技术，真实的资源地址可能在以下属性中：
- \`data-src\`、\`data-original\`、\`data-lazy-src\`
- \`data-srcset\`、\`data-lazy-srcset\`
- \`data-poster\`（视频封面）

优先使用这些属性中的地址，而非 \`src\` 中的占位图。

### 4. 特殊内容保留
- **代码块**：保留语言标识和完整代码
- **数学公式**：保留 LaTeX 格式（行内使用 \`$...$\`，块级使用 \`$$...$$\`）
- **表格**：转换为 Markdown 表格格式
- **引用**：使用 \`>\` 标记
- **链接**：保留所有超链接，使用 \`[文本](URL)\` 格式
${translationRule}

### ${translateToChinese ? "6" : "5"}. 补充说明块（可选）

当你觉得有必要时，可以使用特殊的提示块来补充信息，帮助读者更好地理解内容。提示块的语法如下：


:::type{title="标题"}
提示内容，支持任意 Markdown 格式
:::


支持的类型（type）：
- \`tip\`：提示、技巧、最佳实践
- \`note\`：备注、说明
- \`info\`：信息补充、背景知识
- \`warning\`：警告、注意事项
- \`danger\`：危险、严重警告

使用场景：
- 内容已过时，需要提醒读者
- 补充背景知识或上下文
- 添加示例帮助理解
- 提醒潜在的问题或陷阱
- 分享最佳实践或技巧

示例：

:::warning{title="已过时"}
该 API 从 v2.0 开始已被废弃，请使用 \`newMethod()\` 替代。
:::

:::tip{title="最佳实践"}
建议使用 TypeScript 来获得更好的类型提示和编译时检查。
:::

:::info{title="背景知识"}
React 18 引入了并发渲染特性，这改变了组件的渲染行为。
:::

注意：仅在确实有必要时才添加提示块，不要过度使用。

## 输出要求

### 格式规范（重要）

**块级元素之间必须有空行**：Markdown 中，块级元素（段落、标题、图片、代码块、列表、表格、引用等）之间必须用空行分隔，即两个换行符（\`\\n\\n\`）。

**图片格式**：
- 独占一行的图片，上下都必须有空行，否则会被解析为行内图片
- 正确示例：

这是一段文字。

![图片描述](https://example.com/image.png)

这是另一段文字。

- 错误示例（图片会变成行内元素）：

这是一段文字。
![图片描述](https://example.com/image.png)
这是另一段文字。

### 其他要求

- 直接输出 Markdown 内容，不需要包裹在代码块中
- 不要添加额外的说明或注释（除了上述提示块）
- 确保输出是合法的 Markdown 格式${outputLanguage}`;
};

class WebClipModule {
  private backendServer: BackendWebSocketServer | null = null;
  private activeTasks: Map<number, WebClipTask> = new Map();

  async init(backendServer: BackendWebSocketServer) {
    this.backendServer = backendServer;

    // 注册开始解析的处理器
    this.backendServer.addMessageHandler("web-clip:start", async (message: RpcRequestMessage) => {
      const { id, method } = message;
      const params = message.params as unknown as WebClipStartPayload | undefined;

      if (!params || !params.projectItemId || !params.html) {
        return {
          type: RpcMessageType.Response,
          id,
          method,
          result: null,
          error: { code: 1, message: "缺少必要参数" },
        } as RpcResponseMessage;
      }

      // 如果已经有任务在进行，先取消它
      const existingTask = this.activeTasks.get(params.projectItemId);
      if (existingTask && existingTask.status === "processing") {
        existingTask.abortController.abort();
        existingTask.status = "cancelled";
      }

      // 创建新任务
      const abortController = new AbortController();
      const task: WebClipTask = {
        projectItemId: params.projectItemId,
        url: params.url,
        title: params.title,
        abortController,
        status: "processing",
        accumulatedMarkdown: "",
      };
      this.activeTasks.set(params.projectItemId, task);

      // 异步执行解析
      this.processWebClip(params, task);

      return {
        type: RpcMessageType.Response,
        id,
        method,
        result: { ok: true, projectItemId: params.projectItemId },
        error: null,
      } as RpcResponseMessage;
    });

    // 注册取消解析的处理器
    this.backendServer.addMessageHandler("web-clip:cancel", async (message: RpcRequestMessage) => {
      const { id, method } = message;
      const params = message.params as unknown as { projectItemId: number } | undefined;

      if (!params || !params.projectItemId) {
        return {
          type: RpcMessageType.Response,
          id,
          method,
          result: null,
          error: { code: 1, message: "缺少 projectItemId" },
        } as RpcResponseMessage;
      }

      const task = this.activeTasks.get(params.projectItemId);
      if (task && task.status === "processing") {
        task.abortController.abort();
        task.status = "cancelled";
        this.activeTasks.delete(params.projectItemId);
      }

      return {
        type: RpcMessageType.Response,
        id,
        method,
        result: { ok: true },
        error: null,
      } as RpcResponseMessage;
    });

    // 注册获取任务状态的处理器
    this.backendServer.addMessageHandler("web-clip:status", async (message: RpcRequestMessage) => {
      const { id, method } = message;
      const params = message.params as unknown as { projectItemId: number } | undefined;

      const task = params?.projectItemId ? this.activeTasks.get(params.projectItemId) : null;

      return {
        type: RpcMessageType.Response,
        id,
        method,
        result: task
          ? {
              projectItemId: task.projectItemId,
              status: task.status,
              markdown: task.accumulatedMarkdown,
            }
          : null,
        error: null,
      } as RpcResponseMessage;
    });
  }

  private async processWebClip(params: WebClipStartPayload, task: WebClipTask): Promise<void> {
    const {
      projectItemId,
      apiKey,
      baseUrl: llmBaseUrl,
      modelName,
      url: pageUrl,
      translateToChinese,
    } = params;

    const html = params.html;

    // 生成包含页面 URL 的提示词
    const systemPrompt = buildConvertPrompt(pageUrl, translateToChinese);

    try {
      const chatPath = `${llmBaseUrl}${llmBaseUrl.endsWith("/") ? "" : "/"}chat/completions`;

      const payload = {
        model: modelName,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: html,
          },
        ],
        stream: true,
        temperature: 0.3,
      };

      log.info(
        `Web clip starting for projectItemId: ${projectItemId}, HTML length: ${html.length}, model: ${modelName}`
      );

      const response = await fetch(chatPath, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: task.abortController.signal,
      });

      if (!response.ok) {
        let errorBody = "";
        try {
          errorBody = await response.text();
        } catch {
          errorBody = "无法读取错误响应体";
        }
        log.error(`LLM API error - status: ${response.status}, body: ${errorBody}`);
        throw new Error(`LLM API 错误 (${response.status}): ${errorBody || response.statusText}`);
      }

      if (!response.body) {
        throw new Error("Response body is empty");
      }

      // 处理流式响应
      const reader = response.body;
      const decoder = new TextDecoder();
      let buffer = "";

      for await (const chunk of reader) {
        if (task.abortController.signal.aborted) {
          break;
        }

        buffer += decoder.decode(chunk as Buffer, { stream: true });

        // 解析 SSE 格式的数据
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();

            if (data === "[DONE]") {
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;

              if (content) {
                task.accumulatedMarkdown += content;

                // 发送进度通知
                this.backendServer?.sendNotification("web-clip:progress", {
                  projectItemId,
                  markdown: task.accumulatedMarkdown,
                  delta: content,
                });
              }
            } catch (parseError) {
              // 忽略解析错误，可能是不完整的 JSON
              log.debug("Parse SSE chunk error:", parseError);
            }
          }
        }
      }

      // 解析完成
      task.status = "completed";

      // 保存到数据库
      const savedData = await this.saveWebClipToDatabase(
        projectItemId,
        task.accumulatedMarkdown,
        task.url,
        task.title
      );

      this.backendServer?.sendNotification("web-clip:complete", {
        projectItemId,
        markdown: task.accumulatedMarkdown,
        url: task.url,
        title: task.title,
        webClipId: savedData?.webClipId,
        contentId: savedData?.contentId,
      });

      log.info(
        `Web clip completed for projectItemId: ${projectItemId}, webClipId: ${savedData?.webClipId}`
      );
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        log.info(`Web clip cancelled for projectItemId: ${projectItemId}`);
        return;
      }

      task.status = "error";
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      this.backendServer?.sendNotification("web-clip:error", {
        projectItemId,
        error: errorMessage,
      });

      log.error(`Web clip error for projectItemId: ${projectItemId}`, error);
    } finally {
      // 清理任务（保留一段时间以便查询状态）
      setTimeout(() => {
        if (this.activeTasks.get(projectItemId) === task) {
          this.activeTasks.delete(projectItemId);
        }
      }, 60000);
    }
  }

  /**
   * 保存解析结果到数据库
   */
  private async saveWebClipToDatabase(
    projectItemId: number,
    markdown: string,
    url: string,
    title: string
  ): Promise<{ webClipId: number; contentId: number } | null> {
    try {
      const db = databaseManager.getCurrentDatabase();
      if (!db) {
        log.error("[WebClip] No database available");
        return null;
      }

      // 将 markdown 转换为 Descendant[]
      let content: Descendant[];
      try {
        content = importFromMarkdown(markdown, ["yaml"]);
        if (!content || content.length === 0) {
          content = [
            {
              type: "paragraph",
              children: [{ type: "formatted", text: markdown || "" }],
            },
          ] as Descendant[];
        }
      } catch (parseError) {
        log.warn("[WebClip] Parse markdown error:", parseError);
        content = [
          {
            type: "paragraph",
            children: [{ type: "formatted", text: markdown || "" }],
          },
        ] as Descendant[];
      }

      // 查询是否已存在关联
      const existingLinks = ContentLinkTable.queryBySource(db, {
        sourceId: projectItemId,
        sourceType: "project_item",
        targetType: "web_clip",
      });

      if (existingLinks.length > 0) {
        // 已存在，更新内容
        const existingWebClip = WebClipTable.getById(db, existingLinks[0].targetId);
        if (existingWebClip) {
          // 经 ContentTable.updateContent 更新（省略 ctx 走默认全广播，与原手写行为一致）
          ContentTable.updateContent(db, existingWebClip.contentId, { content });

          // 更新 web_clip 标题
          WebClipTable.update(db, {
            id: existingWebClip.id,
            title: title || existingWebClip.title,
          });
          log.info(`[WebClip] Updated existing web clip: ${existingWebClip.id}`);
          return {
            webClipId: existingWebClip.id,
            contentId: existingWebClip.contentId,
          };
        }
      }

      // 不存在，创建新的
      // 1. 创建 content
      const contentId = ContentTable.createContent(db, {
        content,
        count: content.length,
      });
      if (!contentId) {
        log.error("[WebClip] Failed to create content");
        return null;
      }

      // 2. 创建 web_clip
      const webClip = WebClipTable.create(db, {
        contentId,
        url,
        title: title || "解析文档",
      });

      // 3. 创建 content_link 关联
      ContentLinkTable.create(db, {
        sourceId: projectItemId,
        sourceType: "project_item",
        targetId: webClip.id,
        targetType: "web_clip",
      });

      log.info(`[WebClip] Created new web clip: ${webClip.id}, contentId: ${contentId}`);
      return {
        webClipId: webClip.id,
        contentId,
      };
    } catch (error) {
      log.error("[WebClip] Save to database error:", error);
      return null;
    }
  }
}

export default new WebClipModule();
