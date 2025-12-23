import type { ToolParameterSchema } from "@/types";
import type { MCPProviderDefinition } from "./types";
import {
  getCurrentPanels,
  getPaneTabs,
  getActiveTabContent,
  getTabContent,
} from "../tab-content/utils";

export const tabToolsProvider: MCPProviderDefinition = {
  id: "tab-tools",
  name: "Tab 工具",
  description: "提供 Tab 面板和内容查询工具，用于感知当前界面状态",
  defaultEnabled: true,
  tools: () => [
    {
      name: "get_current_panels",
      description:
        "获取当前所有面板(panes)的信息，包括每个面板中的 tab 列表、激活状态、分组信息等。用于了解当前界面布局。",
      parameters: {
        type: "object",
        properties: {} as Record<string, ToolParameterSchema>,
        required: [],
        additionalProperties: false,
      },
      executor: async () => {
        const panels = getCurrentPanels();
        return {
          content: JSON.stringify(panels, null, 2),
        };
      },
    },
    {
      name: "get_panel_tabs",
      description:
        "获取指定面板下的所有 tabs 信息，包括 tab 类型、标题、是否激活等。",
      parameters: {
        type: "object",
        properties: {
          paneId: {
            type: "string",
            description: "面板 ID",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["paneId"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const paneId = args.paneId as string;
        const paneInfo = getPaneTabs(paneId);

        if (!paneInfo) {
          return {
            content: JSON.stringify({
              error: `Panel with ID "${paneId}" not found`,
            }),
          };
        }

        return {
          content: JSON.stringify(paneInfo, null, 2),
        };
      },
    },
    {
      name: "get_active_tab",
      description:
        "获取当前激活的 tab 内容。返回包括元数据和实际数据内容（Markdown 或列表数据）。支持通过 range 参数精确控制获取的内容范围，响应会包含 totalLength 供参考。",
      parameters: {
        type: "object",
        properties: {
          range: {
            type: "array",
            description:
              "可选，内容范围 [start, end]。用于获取指定范围的内容。响应会返回 totalLength，可根据此值决定下次获取的范围。",
            items: { type: "number" },
            minItems: 2,
            maxItems: 2,
          },
          itemRange: {
            type: "array",
            description:
              "可选，列表项范围 [start, end]。用于获取指定范围的列表项。响应会返回 totalLength（总项数），可根据此值决定下次获取的范围。",
            items: { type: "number" },
            minItems: 2,
            maxItems: 2,
          },
          includeMetadata: {
            type: "boolean",
            description: "可选，是否包含详细元数据。默认 true。",
          },
        } as Record<string, ToolParameterSchema>,
        required: [],
        additionalProperties: false,
      },
      executor: async (args) => {
        const options = {
          range: args.range as [number, number] | undefined,
          itemRange: args.itemRange as [number, number] | undefined,
          includeMetadata: args.includeMetadata as boolean | undefined,
        };

        try {
          const content = await getActiveTabContent(options);

          if (!content) {
            return {
              content: JSON.stringify({
                error: "No active tab found",
              }),
            };
          }

          return {
            content: JSON.stringify(content, null, 2),
          };
        } catch (error) {
          return {
            content: JSON.stringify({
              error: `Failed to get active tab content: ${(error as Error).message}`,
            }),
          };
        }
      },
    },
    {
      name: "get_tab_content",
      description:
        "根据 tab ID 获取指定 tab 的内容。返回包括元数据和实际数据内容（Markdown 或列表数据）。支持通过 range 参数精确控制获取的内容范围，响应会包含 totalLength 供参考。",
      parameters: {
        type: "object",
        properties: {
          tabId: {
            type: "string",
            description: "Tab ID",
          },
          range: {
            type: "array",
            description:
              "可选，内容范围 [start, end]。用于获取指定范围的内容。响应会返回 totalLength，可根据此值决定下次获取的范围。",
            items: { type: "number" },
            minItems: 2,
            maxItems: 2,
          },
          itemRange: {
            type: "array",
            description:
              "可选，列表项范围 [start, end]。用于获取指定范围的列表项。响应会返回 totalLength（总项数），可根据此值决定下次获取的范围。",
            items: { type: "number" },
            minItems: 2,
            maxItems: 2,
          },
          includeMetadata: {
            type: "boolean",
            description: "可选，是否包含详细元数据。默认 true。",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["tabId"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const tabId = args.tabId as string;
        const options = {
          range: args.range as [number, number] | undefined,
          itemRange: args.itemRange as [number, number] | undefined,
          includeMetadata: args.includeMetadata as boolean | undefined,
        };

        try {
          const content = await getTabContent(tabId, options);

          if (!content) {
            return {
              content: JSON.stringify({
                error: `Tab with ID "${tabId}" not found`,
              }),
            };
          }

          return {
            content: JSON.stringify(content, null, 2),
          };
        } catch (error) {
          return {
            content: JSON.stringify({
              error: `Failed to get tab content: ${(error as Error).message}`,
            }),
          };
        }
      },
    },
  ],
};
