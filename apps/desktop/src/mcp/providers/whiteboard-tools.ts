import type { ToolParameterSchema } from "@/types";
import {
  getWhiteBoardById,
  getWhiteBoardContentById,
} from "@/commands/white-board";
import type { BoardElement } from "@/components/WhiteBoard";
import type { MCPProviderDefinition } from "./types";

/**
 * 从元素树中递归查找指定 ID 的元素
 */
function findElementById(
  elements: BoardElement[],
  targetId: string,
): BoardElement | null {
  for (const element of elements) {
    if (element.id === targetId) {
      return element;
    }
    if (element.children && element.children.length > 0) {
      const found = findElementById(element.children, targetId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 将元素转换为简化的摘要信息（不包含完整内容）
 */
function elementToSummary(element: BoardElement) {
  return {
    id: element.id,
    type: element.type,
    name: element.name,
    groupId: element.groupId,
    hasChildren: !!(element.children && element.children.length > 0),
    childrenCount: element.children?.length || 0,
    // 提取一些常见的属性（如果存在）
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    text: element.text,
    // 标识属性
    resizable: element.resizable,
    autoHeight: element.autoHeight,
  };
}

/**
 * 递归遍历元素树，返回扁平化的元素摘要列表
 */
function flattenElements(
  elements: BoardElement[],
  depth = 0,
): Array<ReturnType<typeof elementToSummary> & { depth: number }> {
  const result: Array<ReturnType<typeof elementToSummary> & { depth: number }> =
    [];

  for (const element of elements) {
    result.push({ ...elementToSummary(element), depth });
    if (element.children && element.children.length > 0) {
      result.push(...flattenElements(element.children, depth + 1));
    }
  }

  return result;
}

export const whiteboardToolsProvider: MCPProviderDefinition = {
  id: "whiteboard-tools",
  name: "白板工具",
  description:
    "提供白板内容的细粒度查询工具，支持获取白板页面、元素列表和元素详情",
  defaultEnabled: true,
  tools: () => [
    {
      name: "get_whiteboard_pages",
      description:
        "获取白板的所有页面（WhiteBoardContent）列表。返回页面 ID、名称、元素数量等概览信息。",
      parameters: {
        type: "object",
        properties: {
          whiteBoardId: {
            type: "number",
            description: "白板 ID",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["whiteBoardId"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const whiteBoardId = args.whiteBoardId as number;

        const whiteBoard = await getWhiteBoardById(whiteBoardId);

        const pages = whiteBoard.whiteBoardContentList.map((content) => ({
          id: content.id,
          name: content.name,
          imgUrl: content.imgUrl,
          elementCount: content.data.children.length,
          hasPresentationSequences: !!(
            content.data.presentationSequences &&
            content.data.presentationSequences.length > 0
          ),
          createTime: content.createTime,
          updateTime: content.updateTime,
        }));

        return {
          content: JSON.stringify(
            {
              whiteBoardId: whiteBoard.id,
              title: whiteBoard.title,
              description: whiteBoard.description,
              tags: whiteBoard.tags,
              pageCount: pages.length,
              pages,
            },
            null,
            2,
          ),
        };
      },
    },
    {
      name: "get_whiteboard_page_elements",
      description:
        "获取白板指定页面的所有元素列表（扁平化展示，包含层级深度）。返回元素 ID、类型、名称、位置、尺寸等摘要信息，不包含完整内容。",
      parameters: {
        type: "object",
        properties: {
          whiteBoardContentId: {
            type: "number",
            description: "白板页面 ID（WhiteBoardContent ID）",
          },
          elementType: {
            type: "string",
            description:
              "可选，筛选特定类型的元素。可选值：geometry, straightArrow, text, image, card, mindMap, webview, frame, whiteboard, column",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["whiteBoardContentId"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const whiteBoardContentId = args.whiteBoardContentId as number;
        const elementType = args.elementType as string | undefined;

        const content = await getWhiteBoardContentById(whiteBoardContentId);

        // 扁平化元素树
        let elements = flattenElements(content.data.children);

        // 如果指定了类型，筛选
        if (elementType) {
          elements = elements.filter((el) => el.type === elementType);
        }

        return {
          content: JSON.stringify(
            {
              whiteBoardContentId: content.id,
              pageName: content.name,
              totalElements: elements.length,
              elements,
              viewPort: content.data.viewPort,
            },
            null,
            2,
          ),
        };
      },
    },
    {
      name: "get_whiteboard_element_details",
      description:
        "根据元素 ID 获取白板元素的完整详细信息。返回元素的所有属性，包括内容、样式、子元素等。",
      parameters: {
        type: "object",
        properties: {
          whiteBoardContentId: {
            type: "number",
            description: "白板页面 ID（WhiteBoardContent ID）",
          },
          elementId: {
            type: "string",
            description: "元素 ID",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["whiteBoardContentId", "elementId"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const whiteBoardContentId = args.whiteBoardContentId as number;
        const elementId = args.elementId as string;

        const content = await getWhiteBoardContentById(whiteBoardContentId);

        // 在元素树中查找目标元素
        const element = findElementById(content.data.children, elementId);

        if (!element) {
          return {
            content: JSON.stringify({
              error: `元素 ${elementId} 不存在于白板页面 ${whiteBoardContentId} 中`,
            }),
          };
        }

        // 返回完整元素数据
        return {
          content: JSON.stringify(
            {
              whiteBoardContentId: content.id,
              pageName: content.name,
              element,
            },
            null,
            2,
          ),
        };
      },
    },
    {
      name: "get_whiteboard_elements_by_ids",
      description:
        "批量获取白板元素的详细信息。根据元素 ID 数组批量查询，返回每个元素的完整数据。",
      parameters: {
        type: "object",
        properties: {
          whiteBoardContentId: {
            type: "number",
            description: "白板页面 ID（WhiteBoardContent ID）",
          },
          elementIds: {
            type: "array",
            items: { type: "string" },
            description:
              "元素 ID 数组。例如：['elem-1', 'elem-2']。最多支持50个元素。",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["whiteBoardContentId", "elementIds"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const whiteBoardContentId = args.whiteBoardContentId as number;
        const elementIds = args.elementIds as string[];

        if (elementIds.length > 50) {
          return {
            content: JSON.stringify({
              error: "一次最多查询50个元素",
            }),
          };
        }

        const content = await getWhiteBoardContentById(whiteBoardContentId);

        // 批量查找元素
        const elements: Record<string, BoardElement | null> = {};
        for (const id of elementIds) {
          elements[id] = findElementById(content.data.children, id);
        }

        // 统计结果
        const foundCount = Object.values(elements).filter(
          (el) => el !== null,
        ).length;
        const notFoundIds = elementIds.filter((id) => elements[id] === null);

        return {
          content: JSON.stringify(
            {
              whiteBoardContentId: content.id,
              pageName: content.name,
              requestedCount: elementIds.length,
              foundCount,
              notFoundCount: notFoundIds.length,
              notFoundIds,
              elements,
            },
            null,
            2,
          ),
        };
      },
    },
  ],
};
