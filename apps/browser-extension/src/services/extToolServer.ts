import WebSocketServer from "@/utils/WebSocketServer";
import WebSocketClient from "@/utils/WebSocketClient";
import type { RpcRequestMessage } from "@/utils/types";

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// 工具调用请求参数
interface ToolExecuteParams {
  requestId: string;
  toolCall: {
    id: string;
    function: {
      name: string;
      // 可能是 JSON 字符串，也可能经过 WebSocket 序列化后已变为对象
      arguments: string | Record<string, unknown>;
    };
  };
}

export const BROWSER_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_page_content",
      description: "获取当前网页的文本内容",
      parameters: {
        type: "object",
        properties: {
          selector: {
            type: "string",
            description:
              "可选的 CSS 选择器，获取特定元素内容。不提供则获取整个页面内容",
          },
          maxLength: {
            type: "number",
            description: "最大返回字符数，默认 10000",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_selected_text",
      description: "获取用户当前在网页上选中的文本",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_page_metadata",
      description: "获取当前网页的元数据（标题、描述、URL、关键词等）",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_page_links",
      description: "获取当前网页上的所有链接",
      parameters: {
        type: "object",
        properties: {
          maxCount: {
            type: "number",
            description: "最大返回链接数，默认 50",
          },
        },
      },
    },
  },
];

// Clipper 提取结果类型
interface ExtClipperExtractResult {
  success: boolean;
  markdown?: string;
  length?: number;
  error?: string;
}

// 通过 innerText 降级提取页面内容
const fallbackGetPageContent = async (
  tabId: number,
  selector: string | null,
  maxLength: number,
): Promise<{ content: string }> => {
  const start = performance.now();
  console.log(
    `[Tau Extension Tools][fallback] 开始提取, selector=${selector}, maxLength=${maxLength}`,
  );

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel: string | null, max: number) => {
      let text: string;
      if (sel) {
        const element = document.querySelector(sel);
        text = element?.textContent || `未找到匹配选择器 "${sel}" 的元素`;
      } else {
        const article = document.querySelector("article");
        const main = document.querySelector("main");
        const content = article || main || document.body;
        text = content.innerText;
      }
      return text.slice(0, max);
    },
    args: [selector, maxLength],
  });

  const content = results[0]?.result || "获取内容失败";
  console.log(
    `[Tau Extension Tools][fallback] 提取完成, 耗时: ${(performance.now() - start).toFixed(0)}ms, 内容长度: ${content.length}`,
  );
  return { content };
};

const toolExecutors: Record<
  string,
  (params: Record<string, unknown>) => Promise<{ content: string }>
> = {
  get_page_content: async (params) => {
    const selector = params.selector as string | undefined;
    const maxLength = (params.maxLength as number) || 10000;
    const totalStart = performance.now();

    console.log(`[Tau Extension Tools][get_page_content] 开始执行, params:`, {
      selector,
      maxLength,
    });

    try {
      // 步骤 1: 获取当前标签页
      let t0 = performance.now();
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      console.log(
        `[Tau Extension Tools][get_page_content] chrome.tabs.query 耗时: ${(performance.now() - t0).toFixed(0)}ms`,
      );
      if (!tab?.id) {
        return { content: "无法获取当前标签页" };
      }

      // 指定了 selector 时，直接通过 executeScript 获取目标元素文本
      if (selector) {
        console.log(
          `[Tau Extension Tools][get_page_content] 使用 selector 路径: "${selector}"`,
        );
        const result = await fallbackGetPageContent(
          tab.id,
          selector,
          maxLength,
        );
        console.log(
          `[Tau Extension Tools][get_page_content] 总耗时: ${(performance.now() - totalStart).toFixed(0)}ms`,
        );
        return result;
      }

      // 未指定 selector：优先通过 aiServer RPC clipper 获取结构化 Markdown
      // 注意：clipper 请求需通过 aiServerClient（/aiServer 通道）发送，
      // 而非 extToolServer（/extToolServer 通道），因为 WebSocket 代理只支持
      // client->server 单向路由，extToolServer 作为 server 无法向 client 发送请求。
      if (aiServerClient?.isConnected) {
        console.log(
          `[Tau Extension Tools][get_page_content] aiServerClient 已连接，使用 RPC clipper 路径`,
        );
        try {
          // 获取页面 HTML、URL、标题
          t0 = performance.now();
          const htmlResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => ({
              html: document.documentElement.outerHTML,
              url: window.location.href,
              title: document.title,
            }),
          });
          const pageData = htmlResults[0]?.result;
          console.log(
            `[Tau Extension Tools][get_page_content] 获取页面 HTML 耗时: ${(performance.now() - t0).toFixed(0)}ms, HTML 长度: ${pageData?.html?.length ?? 0}`,
          );

          if (pageData) {
            t0 = performance.now();
            const result = (await aiServerClient.sendRequest(
              "ext.clipper.extract",
              {
                html: pageData.html,
                url: pageData.url,
                title: pageData.title,
                mode: "smart",
              },
              20000, // 20s 超时，预留空间给 fallback
            )) as ExtClipperExtractResult;
            console.log(
              `[Tau Extension Tools][get_page_content] RPC ext.clipper.extract 耗时: ${(performance.now() - t0).toFixed(0)}ms, success=${result.success}, markdown长度=${result.markdown?.length ?? 0}`,
            );

            if (result.success && result.markdown) {
              const content = result.markdown.slice(0, maxLength);
              console.log(
                `[Tau Extension Tools][get_page_content] 总耗时: ${(performance.now() - totalStart).toFixed(0)}ms (clipper 成功)`,
              );
              return { content };
            }
          }
        } catch (rpcError) {
          console.warn(
            `[Tau Extension Tools][get_page_content] RPC clipper 提取失败 (耗时: ${(performance.now() - t0).toFixed(0)}ms)，回退到 innerText:`,
            rpcError,
          );
        }
      } else {
        console.log(
          `[Tau Extension Tools][get_page_content] aiServerClient 未连接 (connected=${aiServerClient?.isConnected})，直接使用 innerText`,
        );
      }

      // 降级：使用 innerText 提取
      const result = await fallbackGetPageContent(tab.id, null, maxLength);
      console.log(
        `[Tau Extension Tools][get_page_content] 总耗时: ${(performance.now() - totalStart).toFixed(0)}ms (fallback)`,
      );
      return result;
    } catch (error) {
      console.error(`[Tau Extension Tools][get_page_content] 执行异常:`, error);
      return { content: `获取页面内容失败: ${(error as Error).message}` };
    }
  },

  get_selected_text: async () => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) {
        return { content: "无法获取当前标签页" };
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          return window.getSelection()?.toString() || "";
        },
      });

      const selectedText = results[0]?.result || "";
      if (!selectedText) {
        return { content: "当前没有选中任何文本" };
      }
      return { content: selectedText };
    } catch (error) {
      return { content: `获取选中文本失败: ${(error as Error).message}` };
    }
  },

  get_page_metadata: async () => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) {
        return { content: "无法获取当前标签页" };
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const getMeta = (name: string) => {
            const meta =
              document.querySelector(`meta[name="${name}"]`) ||
              document.querySelector(`meta[property="${name}"]`);
            return meta?.getAttribute("content") || "";
          };

          return JSON.stringify(
            {
              title: document.title,
              description: getMeta("description") || getMeta("og:description"),
              keywords: getMeta("keywords"),
              author: getMeta("author"),
              url: window.location.href,
              ogTitle: getMeta("og:title"),
              ogImage: getMeta("og:image"),
              ogType: getMeta("og:type"),
              siteName: getMeta("og:site_name"),
            },
            null,
            2,
          );
        },
      });

      return { content: results[0]?.result || "获取元数据失败" };
    } catch (error) {
      return { content: `获取页面元数据失败: ${(error as Error).message}` };
    }
  },

  get_page_links: async (params) => {
    const maxCount = (params.maxCount as number) || 50;

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) {
        return { content: "无法获取当前标签页" };
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (max: number) => {
          const links = Array.from(document.querySelectorAll("a[href]"));
          const uniqueLinks = new Map<string, string>();

          for (const link of links) {
            const href = (link as HTMLAnchorElement).href;
            const text = link.textContent?.trim() || href;
            if (href && !uniqueLinks.has(href)) {
              uniqueLinks.set(href, text);
            }
            if (uniqueLinks.size >= max) break;
          }

          return JSON.stringify(
            Array.from(uniqueLinks.entries()).map(([url, text]) => ({
              url,
              text: text.slice(0, 100),
            })),
            null,
            2,
          );
        },
        args: [maxCount],
      });

      return { content: results[0]?.result || "获取链接失败" };
    } catch (error) {
      return { content: `获取页面链接失败: ${(error as Error).message}` };
    }
  },
};

let extToolServer: WebSocketServer | null = null;
// aiServer WebSocket 客户端，用于向桌面端发送 RPC 请求（如 ext.clipper.extract）
// 注意：不能复用 extToolServer（WebSocketServer）发送请求，因为 WebSocket 代理
// 只支持 client->server 方向的 Request 路由。extToolServer 在 /extToolServer 通道
// 上是 server 角色，它发出的 Request 会被代理路由回自身而非桌面端。
let aiServerClient: WebSocketClient | null = null;
let isInitialized = false;

const handleToolExecute = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as ToolExecuteParams;
  const { toolCall } = params;
  const startTime = performance.now();

  console.log("[Tau Extension Tools] 执行工具:", toolCall.function.name);

  const executor = toolExecutors[toolCall.function.name];
  if (!executor) {
    return { content: `未知工具: ${toolCall.function.name}` };
  }

  try {
    const rawArgs = toolCall.function.arguments;
    let args: Record<string, unknown> = {};
    if (rawArgs) {
      if (typeof rawArgs === "string") {
        try {
          args = JSON.parse(rawArgs);
        } catch {
          console.warn(
            "[Tau Extension Tools] 参数解析失败，使用默认值:",
            rawArgs,
          );
        }
      } else {
        args = rawArgs as Record<string, unknown>;
      }
    }
    const res = await executor(args);
    console.log(
      `[Tau Extension Tools] 工具 ${toolCall.function.name} 执行完成，耗时: ${(performance.now() - startTime).toFixed(0)}ms`,
    );
    return res;
  } catch (error) {
    console.error(
      `[Tau Extension Tools] 工具 ${toolCall.function.name} 执行失败，耗时: ${(performance.now() - startTime).toFixed(0)}ms`,
      error,
    );
    return { content: `工具执行失败: ${(error as Error).message}` };
  }
};

const AI_SERVER_URL = "ws://localhost:24678/aiServer";

export const initExtToolServer = () => {
  if (isInitialized) {
    console.log("[Tau Extension Tools] 已初始化，跳过");
    return;
  }

  console.log("[Tau Extension Tools] 初始化浏览器工具服务...");

  // 创建工具服务端（接收桌面端的工具调用请求）
  extToolServer = new WebSocketServer("extToolServer");

  // 注册工具执行处理器
  extToolServer.addRequestHandler("ext.tool.execute", handleToolExecute);

  // 创建 aiServer 客户端（用于向桌面端发送 RPC 请求，如 clipper 提取）
  aiServerClient = new WebSocketClient(AI_SERVER_URL);
  aiServerClient.onOpenHandler = () => {
    console.log("[Tau Extension Tools] aiServerClient 已连接到 /aiServer");
  };
  aiServerClient.onCloseHandler = () => {
    console.log("[Tau Extension Tools] aiServerClient 连接断开，5秒后重连");
    // 简单重连策略
    setTimeout(() => {
      if (isInitialized && aiServerClient) {
        console.log("[Tau Extension Tools] aiServerClient 重连中...");
        aiServerClient.connect();
      }
    }, 5000);
  };
  aiServerClient.connect();

  isInitialized = true;
  console.log("[Tau Extension Tools] 浏览器工具服务初始化完成");
};

export const closeExtToolServer = () => {
  if (extToolServer) {
    extToolServer.close();
    extToolServer = null;
  }
  if (aiServerClient) {
    aiServerClient.disconnect();
    aiServerClient = null;
  }
  isInitialized = false;
  console.log("[Tau Extension Tools] 浏览器工具服务已关闭");
};

export default {
  init: initExtToolServer,
  close: closeExtToolServer,
  BROWSER_TOOLS,
};
