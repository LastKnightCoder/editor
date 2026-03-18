import type { ToolDefinition, ToolExecutionContext } from "@/types";
import {
  GENERATIVE_UI_AVAILABLE_MODULES,
  SHOW_WIDGET_TOOL_NAME,
  VISUALIZE_READ_ME_TOOL_NAME,
} from "@/generative-ui/constants";
import { getGenerativeUiGuidelines } from "@/generative-ui/guideline-registry";
import {
  buildGenerativeWidgetMetadata,
  buildGenerativeWidgetPayload,
} from "@/generative-ui/widget-render-payload";

const readMeSeenConversations = new Set<string>();
const signalSessionTokens = new WeakMap<AbortSignal, string>();
let signalTokenCounter = 0;

const getConversationToken = (
  context?: ToolExecutionContext,
): string | null => {
  if (context?.conversationKey) {
    return `conversation:${context.conversationKey}`;
  }

  if (context?.signal) {
    const existing = signalSessionTokens.get(context.signal);
    if (existing) {
      return existing;
    }
    signalTokenCounter += 1;
    const nextToken = `signal:${signalTokenCounter}`;
    signalSessionTokens.set(context.signal, nextToken);
    return nextToken;
  }

  return null;
};

const isValidModule = (value: unknown): value is string =>
  typeof value === "string" &&
  (GENERATIVE_UI_AVAILABLE_MODULES as readonly string[]).includes(value);

export const createVisualizeReadMeTool = (): ToolDefinition => ({
  name: VISUALIZE_READ_ME_TOOL_NAME,
  description:
    "加载生成式 UI 设计规范。首次使用 show_widget 前必须调用一次，按需求选择 interactive/chart/diagram/mockup/art 模块；若用户要求更强的视觉设计质量，可额外包含 design 模块。",
  parameters: {
    type: "object",
    properties: {
      modules: {
        type: "array",
        description: "要加载的 guideline 模块名称列表。",
        items: {
          type: "string",
          enum: [...GENERATIVE_UI_AVAILABLE_MODULES],
        },
      },
    },
    required: ["modules"],
    additionalProperties: false,
  },
  executor: async (args, context) => {
    const modules = Array.isArray(args.modules)
      ? args.modules.filter(isValidModule)
      : [];
    const conversationToken = getConversationToken(context);
    if (conversationToken) {
      readMeSeenConversations.add(conversationToken);
    }
    return {
      content: getGenerativeUiGuidelines(modules),
    };
  },
});

export const createShowWidgetTool = (): ToolDefinition => ({
  name: SHOW_WIDGET_TOOL_NAME,
  description:
    "在对话中展示生成式 UI 小部件。参数中的 widget_code 是 HTML/SVG 片段，支持流式渲染与最终脚本激活。",
  parameters: {
    type: "object",
    properties: {
      i_have_seen_read_me: {
        type: "boolean",
        description: "确认当前会话已调用 visualize_read_me。",
      },
      title: {
        type: "string",
        description: "小部件标题，建议使用简短 snake_case 或短标题。",
      },
      loading_messages: {
        type: "array",
        description: "渲染期间可显示的短提示语。",
        items: {
          type: "string",
        },
      },
      widget_code: {
        type: "string",
        description:
          "HTML 或 SVG 片段。不要包含 <!DOCTYPE>/<html>/<head>/<body>。",
      },
    },
    required: ["i_have_seen_read_me", "title", "widget_code"],
    additionalProperties: false,
  },
  executor: async (args, context) => {
    const conversationToken = getConversationToken(context);
    const hasSeenReadMe =
      args.i_have_seen_read_me === true &&
      (conversationToken
        ? readMeSeenConversations.has(conversationToken)
        : true);

    if (!hasSeenReadMe) {
      return {
        content:
          "show_widget 调用前必须先调用 visualize_read_me，并在参数中设置 i_have_seen_read_me=true。",
        isParameterError: true,
      };
    }

    const title =
      typeof args.title === "string" && args.title.trim()
        ? args.title.trim()
        : "Widget";
    const widgetCode =
      typeof args.widget_code === "string" ? args.widget_code : "";

    if (!widgetCode.trim()) {
      return {
        content: "show_widget 缺少有效的 widget_code。",
        isParameterError: true,
      };
    }

    const loadingMessages = Array.isArray(args.loading_messages)
      ? args.loading_messages.filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0,
        )
      : [];

    const payload = buildGenerativeWidgetPayload({
      toolCallId: context?.toolCallId || "show_widget",
      title,
      loadingMessages,
      widgetCode,
      phase: "final",
    });

    return {
      content: JSON.stringify(
        {
          success: true,
          title,
          hasScripts: payload.hasScripts,
        },
        null,
        2,
      ),
      metadata: buildGenerativeWidgetMetadata(payload),
    };
  },
});
