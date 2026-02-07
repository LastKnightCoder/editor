import WebSocketServer from "@/utils/WebSocketServer";
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
      arguments: string;
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

  return { content: results[0]?.result || "获取内容失败" };
};

const toolExecutors: Record<
  string,
  (params: Record<string, unknown>) => Promise<{ content: string }>
> = {
  get_page_content: async (params) => {
    const selector = params.selector as string | undefined;
    const maxLength = (params.maxLength as number) || 10000;

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) {
        return { content: "无法获取当前标签页" };
      }

      // 指定了 selector 时，直接通过 executeScript 获取目标元素文本
      if (selector) {
        return await fallbackGetPageContent(tab.id, selector, maxLength);
      }

      // 未指定 selector：优先通过 RPC clipper 获取结构化 Markdown
      if (extToolServer?.connected) {
        try {
          // 获取页面 HTML、URL、标题
          const htmlResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => ({
              html: document.documentElement.outerHTML,
              url: window.location.href,
              title: document.title,
            }),
          });

          const pageData = htmlResults[0]?.result;
          if (pageData) {
            const result =
              await extToolServer.sendRequest<ExtClipperExtractResult>(
                "ext.clipper.extract",
                {
                  html: pageData.html,
                  url: pageData.url,
                  title: pageData.title,
                  mode: "smart",
                },
                600000,
              );

            if (result.success && result.markdown) {
              return { content: result.markdown.slice(0, maxLength) };
            }
          }
        } catch (rpcError) {
          console.warn(
            "[Tau Extension Tools] RPC clipper 提取失败，回退到 innerText:",
            rpcError,
          );
        }
      }

      // 降级：使用 innerText 提取
      return await fallbackGetPageContent(tab.id, null, maxLength);
    } catch (error) {
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
let isInitialized = false;

const handleToolExecute = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as ToolExecuteParams;
  const { toolCall } = params;

  console.log("[Tau Extension Tools] 执行工具:", toolCall.function.name);

  const executor = toolExecutors[toolCall.function.name];
  if (!executor) {
    return { content: `未知工具: ${toolCall.function.name}` };
  }

  try {
    const args = toolCall.function.arguments
      ? JSON.parse(toolCall.function.arguments)
      : {};
    const res = await executor(args);
    return res;
  } catch (error) {
    return { content: `工具执行失败: ${(error as Error).message}` };
  }
};

export const initExtToolServer = () => {
  if (isInitialized) {
    console.log("[Tau Extension Tools] 已初始化，跳过");
    return;
  }

  console.log("[Tau Extension Tools] 初始化浏览器工具服务...");

  // 创建工具服务端
  extToolServer = new WebSocketServer("extToolServer");

  // 注册工具执行处理器
  extToolServer.addRequestHandler("ext.tool.execute", handleToolExecute);

  isInitialized = true;
  console.log("[Tau Extension Tools] 浏览器工具服务初始化完成");
};

export const closeExtToolServer = () => {
  if (extToolServer) {
    extToolServer.close();
    extToolServer = null;
  }
  isInitialized = false;
  console.log("[Tau Extension Tools] 浏览器工具服务已关闭");
};

export default {
  init: initExtToolServer,
  close: closeExtToolServer,
  BROWSER_TOOLS,
};
