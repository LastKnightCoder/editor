import dayjs from "dayjs";
import type { ToolParameterSchema } from "@/types";
import {
  getProjectById,
  getProjectItemsByDates,
  getProjectItemsByDateRange,
  getProjectItemsContentByIds,
  getProjectItemById,
  getProjectItemsByIds,
} from "@/commands";
import { analyzeOperations } from "@/commands/operation";
import { getMarkdown } from "@/utils/markdown-helper";
import { getVideoNoteById } from "@/commands/video-notes";
import { listWebNotesByProjectItemId } from "@/commands/web-note";
import { getPdfById, getPdfAnnotations, getPdfBookmarks } from "@/commands/pdf";
import {
  getEpubById,
  getEpubAnnotations,
  getEpubBookmarks,
} from "@/commands/epub";
import { getWhiteBoardById } from "@/commands/white-board";
import { getDataTableDetail } from "@/commands/data-table";
import type { Project, ProjectItem } from "@/types/project";
import type { MCPProviderDefinition } from "./types";

const PROJECT_TREE_BATCH_SIZE = 50;

const getProjectItemDisplayName = (item: Pick<ProjectItem, "id" | "title">) =>
  `${item.title?.trim() || `条目 #${item.id}`} (projectItemId: ${item.id})`;

const createMissingProjectItemLine = (projectItemId: number) =>
  `[缺失条目] (projectItemId: ${projectItemId})`;

const createCycleProjectItemLine = (projectItemId: number) =>
  `[检测到循环引用] (projectItemId: ${projectItemId})`;

const loadProjectTreeMap = async (
  rootIds: number[],
): Promise<Map<number, ProjectItem>> => {
  const queue = [...new Set(rootIds)];
  const visited = new Set<number>();
  const itemMap = new Map<number, ProjectItem>();

  while (queue.length > 0) {
    const batch = queue.splice(0, PROJECT_TREE_BATCH_SIZE);
    const items = await getProjectItemsByIds(batch);

    items.forEach((item) => {
      if (visited.has(item.id)) {
        return;
      }
      visited.add(item.id);
      itemMap.set(item.id, item);

      if (item.children?.length) {
        queue.push(...item.children);
      }
    });
  }

  return itemMap;
};

const collectDisplayedProjectItemIds = (
  itemMap: Map<number, ProjectItem>,
  rootIds: number[],
): number[] => {
  const result: number[] = [];
  const visited = new Set<number>();

  const walk = (projectItemId: number) => {
    if (visited.has(projectItemId)) {
      return;
    }
    visited.add(projectItemId);

    const item = itemMap.get(projectItemId);
    if (!item) {
      return;
    }

    result.push(projectItemId);
    item.children?.forEach(walk);
  };

  rootIds.forEach(walk);
  return result;
};

const renderProjectTreeLines = (
  itemMap: Map<number, ProjectItem>,
  rootIds: number[],
): string[] => {
  const renderNode = (
    projectItemId: number,
    prefix: string,
    isLast: boolean,
    ancestors: Set<number>,
  ): string[] => {
    const connector = isLast ? "└── " : "├── ";
    const item = itemMap.get(projectItemId);

    if (!item) {
      return [
        `${prefix}${connector}${createMissingProjectItemLine(projectItemId)}`,
      ];
    }

    const currentLine = `${prefix}${connector}${getProjectItemDisplayName(item)}`;
    if (ancestors.has(projectItemId)) {
      return [
        currentLine,
        `${prefix}${isLast ? "    " : "│   "}└── ${createCycleProjectItemLine(projectItemId)}`,
      ];
    }

    const childPrefix = `${prefix}${isLast ? "    " : "│   "}`;
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(projectItemId);
    const childLines = (item.children || []).flatMap(
      (childId, index, children) =>
        renderNode(
          childId,
          childPrefix,
          index === children.length - 1,
          nextAncestors,
        ),
    );

    return [currentLine, ...childLines];
  };

  return rootIds.flatMap((rootId, index) =>
    renderNode(rootId, "", index === rootIds.length - 1, new Set<number>()),
  );
};

const buildProjectTreeResult = async (
  project: Project,
  rootProjectItemId?: number,
) => {
  const projectRootIds = Array.isArray(project.children)
    ? project.children
    : [];
  const itemMap = await loadProjectTreeMap(projectRootIds);

  if (rootProjectItemId != null && !itemMap.has(rootProjectItemId)) {
    const targetItem = await getProjectItemById(rootProjectItemId);
    return {
      success: false,
      error: targetItem
        ? `projectItemId ${rootProjectItemId} 不属于 projectId ${project.id} 的文档树`
        : `projectItemId ${rootProjectItemId} 不存在`,
    };
  }

  const selectedRootIds =
    rootProjectItemId != null ? [rootProjectItemId] : projectRootIds;
  const displayedIds = collectDisplayedProjectItemIds(itemMap, selectedRootIds);
  const header = `${project.title || `项目 #${project.id}`} (projectId: ${project.id})`;

  if (selectedRootIds.length === 0) {
    return {
      success: true,
      projectId: project.id,
      projectTitle: project.title,
      rootProjectItemId: rootProjectItemId ?? null,
      itemCount: 0,
      tree: `${header}\n[空项目]`,
    };
  }

  return {
    success: true,
    projectId: project.id,
    projectTitle: project.title,
    rootProjectItemId: rootProjectItemId ?? null,
    itemCount: displayedIds.length,
    tree: [header, ...renderProjectTreeLines(itemMap, selectedRootIds)].join(
      "\n",
    ),
  };
};

export const projectToolsProvider: MCPProviderDefinition = {
  id: "project-tools",
  name: "项目文档工具",
  description: "提供项目文档查询、操作记录分析和内容获取工具",
  defaultEnabled: true,
  tools: () => [
    {
      name: "get_project_document_tree",
      description:
        "按树形结构列出指定项目的文档树。读取整个项目树时只传 projectId，不要传 projectItemId；只有需要读取某个文档节点及其后代组成的子树时，才传 projectItemId 作为子树根节点。返回结果包含类似 tree 命令的文本，每一行都带有文档标题和 projectItemId。",
      parameters: {
        type: "object",
        properties: {
          projectId: {
            type: "number",
            description: "项目 ID",
          },
          projectItemId: {
            type: "number",
            description:
              "可选，子树根项目项 ID。传入后只返回该项目项及其后代；不传时返回整个项目的文档树。不要把当前打开的文档 ID 当作此参数传入，除非你只想读取这个文档节点的子树。",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["projectId"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const projectId = Number(args.projectId);
        const rootProjectItemId =
          args.projectItemId == null ? undefined : Number(args.projectItemId);

        if (!Number.isInteger(projectId) || projectId <= 0) {
          return {
            content: JSON.stringify({
              success: false,
              error: "projectId 必须是正整数",
            }),
          };
        }

        if (
          rootProjectItemId != null &&
          (!Number.isInteger(rootProjectItemId) || rootProjectItemId <= 0)
        ) {
          return {
            content: JSON.stringify({
              success: false,
              error: "projectItemId 必须是正整数",
            }),
          };
        }

        const project = await getProjectById(projectId);
        if (!project) {
          return {
            content: JSON.stringify({
              success: false,
              error: `projectId ${projectId} 不存在`,
            }),
          };
        }

        return {
          content: JSON.stringify(
            await buildProjectTreeResult(project, rootProjectItemId),
            null,
            2,
          ),
        };
      },
    },
    {
      name: "get_project_items_by_dates",
      description:
        "根据日期数组批量获取项目文档数据。返回按日期分组的文档列表，包括文档的标题、类型、关联项目等信息。",
      parameters: {
        type: "object",
        properties: {
          dates: {
            type: "array",
            items: { type: "string" },
            description:
              "日期数组，格式 YYYY-MM-DD。例如：['2025-01-01', '2025-01-02']。最多支持31个日期。",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["dates"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const dates = args.dates as string[];
        if (dates.length > 31) {
          return "错误：日期数组最多支持31个日期";
        }
        const result = await getProjectItemsByDates(dates);

        // 将每个项目文档的 content 转换为 Markdown
        const converted = Object.fromEntries(
          Object.entries(result).map(([date, items]) => [
            date,
            items.map((item) => ({
              ...item,
              content: item.content ? getMarkdown(item.content) : "",
            })),
          ]),
        );

        return {
          content: JSON.stringify(converted, null, 2),
        };
      },
    },
    {
      name: "get_project_items_by_date_range",
      description:
        "根据日期范围获取项目文档数据。返回按日期分组的文档列表，适用于获取连续时间段的数据。",
      parameters: {
        type: "object",
        properties: {
          startDate: {
            type: "string",
            description: "起始日期，格式 YYYY-MM-DD。例如：2025-01-01",
          },
          endDate: {
            type: "string",
            description: "结束日期，格式 YYYY-MM-DD。例如：2025-01-31",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["startDate", "endDate"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const startDate = args.startDate as string;
        const endDate = args.endDate as string;

        // 验证日期范围不超过1年
        const start = dayjs(startDate);
        const end = dayjs(endDate);
        if (end.diff(start, "day") > 365) {
          return "错误：日期范围最多支持1年";
        }

        const result = await getProjectItemsByDateRange(startDate, endDate);

        // 将每个项目文档的 content 转换为 Markdown
        const converted = Object.fromEntries(
          Object.entries(result).map(([date, items]) => [
            date,
            items.map((item) => ({
              ...item,
              content: item.content ? getMarkdown(item.content) : "",
            })),
          ]),
        );

        return {
          content: JSON.stringify(converted, null, 2),
        };
      },
    },
    {
      name: "get_project_item_operations",
      description:
        "获取项目文档的详细操作记录，包括创建、编辑时间段、删除等信息。编辑时间段会自动合并间隔小于3分钟的连续编辑操作。",
      parameters: {
        type: "object",
        properties: {
          dates: {
            type: "array",
            items: { type: "string" },
            description:
              "可选，日期数组，格式 YYYY-MM-DD。与 startDate/endDate 二选一。",
          },
          startDate: {
            type: "string",
            description:
              "可选，起始日期，格式 YYYY-MM-DD。需与 endDate 一起使用。",
          },
          endDate: {
            type: "string",
            description:
              "可选，结束日期，格式 YYYY-MM-DD。需与 startDate 一起使用。",
          },
        } as Record<string, ToolParameterSchema>,
        required: [],
        additionalProperties: false,
      },
      executor: async (args) => {
        const result = await analyzeOperations({
          dates: args.dates as string[] | undefined,
          startDate: args.startDate as string | undefined,
          endDate: args.endDate as string | undefined,
          contentType: "project-item",
        });
        return {
          content: JSON.stringify(result, null, 2),
        };
      },
    },
    {
      name: "get_project_items_content",
      description:
        "根据项目文档 IDs 获取文档内容（转换为 Markdown 格式）。支持设置最大长度限制以避免返回过长内容。返回的内容包括 Markdown 文本、是否被截断、原始长度以及元数据（标题、关联项目、时间、字数等）。",
      parameters: {
        type: "object",
        properties: {
          ids: {
            type: "array",
            items: { type: "number" },
            description: "项目文档 ID 数组。例如：[1, 2, 3]",
          },
          maxLength: {
            type: "number",
            description:
              "可选，最大长度限制（字符数）。默认无限制。建议设置为 5000 以避免内容过长。",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["ids"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const ids = args.ids as number[];
        const maxLength = args.maxLength as number | undefined;

        if (ids.length > 20) {
          return "错误：一次最多获取20个文档的内容";
        }

        const result = await getProjectItemsContentByIds(ids, maxLength);
        return {
          content: JSON.stringify(result, null, 2),
        };
      },
    },
    {
      name: "get_project_item_details",
      description:
        "获取项目项的完整详情信息，包括 meta 信息（类型、refType、refId）和根据类型自动获取的关联数据。支持文档、网页、视频、白板、PDF、EPUB、数据表格等类型。如果 refType 不存在，则作为文档类型处理。",
      parameters: {
        type: "object",
        properties: {
          projectItemId: {
            type: "number",
            description: "项目项 ID",
          },
          includeContent: {
            type: "boolean",
            description:
              "可选，是否包含详细内容。默认 true。设为 false 可只获取元信息。",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["projectItemId"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const projectItemId = args.projectItemId as number;
        const includeContent = args.includeContent !== false;

        const projectItem = await getProjectItemById(projectItemId);
        if (!projectItem) {
          return {
            content: JSON.stringify({
              error: `项目项 ${projectItemId} 不存在`,
            }),
          };
        }

        const result: any = {
          meta: {
            id: projectItem.id,
            title: projectItem.title,
            projectItemType: projectItem.projectItemType,
            refType: projectItem.refType,
            refId: projectItem.refId,
            createTime: projectItem.createTime,
            updateTime: projectItem.updateTime,
            wordCount: projectItem.count,
            projects: projectItem.projects,
            children: projectItem.children,
            parents: projectItem.parents,
          },
        };

        if (!includeContent) {
          return { content: JSON.stringify(result, null, 2) };
        }

        // 根据 refType 获取关联数据
        try {
          switch (projectItem.refType) {
            case "document":
              result.document = {
                content: getMarkdown(projectItem.content),
                contentId: projectItem.contentId,
              };
              break;

            case "video-note":
              if (projectItem.refId) {
                const videoNote = await getVideoNoteById(projectItem.refId);
                if (videoNote) {
                  result.videoNote = {
                    id: videoNote.id,
                    metaInfo: videoNote.metaInfo,
                    description: videoNote.description,
                    hasTranscript: !!videoNote.transcript,
                    hasSummary: !!videoNote.summary,
                    transcriptLength: videoNote.transcript?.length || 0,
                    segmentCount: videoNote.transcriptSegments?.length || 0,
                  };
                }
              }
              break;

            case "web-link":
              {
                const webNotes =
                  await listWebNotesByProjectItemId(projectItemId);
                result.webView = {
                  content: getMarkdown(projectItem.content),
                  webNotesCount: webNotes.length,
                  webNotes: webNotes.map((wn) => ({
                    id: wn.id,
                    title: wn.title,
                    createTime: wn.createTime,
                  })),
                };
              }

              break;

            case "pdf":
              if (projectItem.refId) {
                const [pdf, annotations, bookmarks] = await Promise.all([
                  getPdfById(projectItem.refId),
                  getPdfAnnotations(projectItem.refId),
                  getPdfBookmarks(projectItem.refId),
                ]);
                result.pdf = {
                  id: pdf.id,
                  fileName: pdf.fileName,
                  filePath: pdf.filePath,
                  isLocal: pdf.isLocal,
                  category: pdf.category,
                  tags: pdf.tags,
                  annotationCount: annotations.length,
                  bookmarkCount: bookmarks.length,
                };
              }
              break;

            case "epub":
              if (projectItem.refId) {
                const [epub, annotations, bookmarks] = await Promise.all([
                  getEpubById(projectItem.refId),
                  getEpubAnnotations(projectItem.refId),
                  getEpubBookmarks(projectItem.refId),
                ]);
                result.epub = {
                  id: epub.id,
                  fileName: epub.fileName,
                  filePath: epub.filePath,
                  title: epub.title,
                  author: epub.author,
                  category: epub.category,
                  tags: epub.tags,
                  progressPercentage: epub.progressPercentage,
                  annotationCount: annotations.length,
                  bookmarkCount: bookmarks.length,
                };
              }
              break;

            case "white-board":
              if (projectItem.refId) {
                const whiteBoard = await getWhiteBoardById(projectItem.refId);
                result.whiteBoard = {
                  id: whiteBoard.id,
                  title: whiteBoard.title,
                  description: whiteBoard.description,
                  tags: whiteBoard.tags,
                  pageCount: whiteBoard.whiteBoardContentList.length,
                  whiteBoardContentId: projectItem.whiteBoardContentId,
                };
              }
              break;

            case "data-table":
              if (projectItem.refId) {
                const tableDetail = await getDataTableDetail(projectItem.refId);
                result.dataTable = {
                  id: tableDetail.table?.id,
                  rowCount: tableDetail.table?.rows.length || 0,
                  columnCount: tableDetail.table?.columns.length || 0,
                  viewCount: tableDetail.views.length,
                  activeViewId: tableDetail.table?.activeViewId,
                  views: tableDetail.views.map((v) => ({
                    id: v.id,
                    name: v.name,
                    type: v.type,
                  })),
                };
              }
              break;

            default:
              // 如果 refType 不存在或未知，作为文档类型处理
              if (!projectItem.refType) {
                result.document = {
                  content: getMarkdown(projectItem.content),
                  contentId: projectItem.contentId,
                };
              } else {
                result.note = `未知的 refType: ${projectItem.refType}`;
              }
          }
        } catch (error) {
          result.error = `获取关联数据失败: ${(error as Error).message}`;
        }

        return {
          content: JSON.stringify(result, null, 2),
        };
      },
    },
  ],
};
