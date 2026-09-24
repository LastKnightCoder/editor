import type { ToolParameterSchema } from "@/types";
import { createCard, getCardById } from "@/commands/card";
import { createArticle, findOneArticle } from "@/commands/article";
import { getProjectItemById } from "@/commands/project";
import { getContentById } from "@/commands/content";
import { openPage } from "@/services/page-navigation";
import { ECardCategory } from "@/types/card";
import { getContentLength } from "@/utils";
import { importFromMarkdown } from "@/utils/markdown";
import { defaultCardEventBus } from "@/utils/event-bus/card-event-bus";
import { defaultArticleEventBus } from "@/utils/event-bus/article-event-bus";
import type { MCPProviderDefinition } from "./types";
import {
  applyEditOperations,
  createPendingContentEditReview,
  createContentEditProposal,
  EditEngineError,
  findContentRanges,
  getActiveEditingSession,
  getActiveEditingSessionByContentId,
  loadSnapshotForContent,
  resolveContentTarget,
  resolveLocatorToRange,
  hasPendingReviewSession,
} from "@/services/content-editing";
import type {
  ContentSnapshot,
  EditOperation,
  SerializedSelection,
} from "@/services/content-editing";
import { offsetToMarkdownPoint } from "@/services/content-editing";
import type { ToolExecutionContext } from "@/types";
import { loadContentMarkdownPayload } from "./content-read-utils";

const reviewToolExecution = {
  timeoutMs: null,
} as const;

const toToolError = (code: string, message: string, extra?: Record<string, unknown>) => {
  return {
    success: false,
    errorCode: code,
    message,
    ...extra,
  };
};

const getSelectionContext = (payload: {
  snapshot: ContentSnapshot;
  selection: SerializedSelection | null;
}) => {
  const { snapshot, selection } = payload;
  if (!selection) {
    return {
      selection: null,
      selectedMarkdown: "",
      selectionBefore: "",
      selectionAfter: "",
      currentBlockMarkdown: "",
    };
  }

  let selectedRange: { start: number; end: number } | null = null;
  let currentBlockRange: { start: number; end: number } | null = null;
  try {
    selectedRange = resolveLocatorToRange({
      locator: { kind: "active-selection" },
      snapshot,
      selection,
    });
  } catch {
    selectedRange = null;
  }

  try {
    currentBlockRange = resolveLocatorToRange({
      locator: { kind: "active-block" },
      snapshot,
      selection,
    });
  } catch {
    currentBlockRange = null;
  }

  const beforeWindow = 120;
  const afterWindow = 120;

  if (!selectedRange) {
    return {
      selection,
      selectedMarkdown: "",
      selectionBefore: "",
      selectionAfter: "",
      currentBlockMarkdown: currentBlockRange
        ? snapshot.markdown.slice(currentBlockRange.start, currentBlockRange.end)
        : "",
    };
  }

  const selectedMarkdown = snapshot.markdown.slice(selectedRange.start, selectedRange.end);
  const selectionBefore = snapshot.markdown.slice(
    Math.max(0, selectedRange.start - beforeWindow),
    selectedRange.start
  );
  const selectionAfter = snapshot.markdown.slice(
    selectedRange.end,
    Math.min(snapshot.markdown.length, selectedRange.end + afterWindow)
  );

  return {
    selection,
    selectedMarkdown,
    selectionBefore,
    selectionAfter,
    currentBlockMarkdown: currentBlockRange
      ? snapshot.markdown.slice(currentBlockRange.start, currentBlockRange.end)
      : "",
  };
};

const previewOperationsCore = async (payload: {
  target?: { contentId?: number };
  baseHash?: string;
  operations: EditOperation[];
  dryRun?: boolean;
}) => {
  const { target, baseHash, operations, dryRun = false } = payload;
  const resolvedTarget = await resolveContentTarget({
    contentId: target?.contentId,
  });
  const { snapshot } = await loadSnapshotForContent(resolvedTarget.contentId);
  const session = getActiveEditingSessionByContentId(resolvedTarget.contentId);
  const selection = session?.selection || null;

  if (baseHash && baseHash !== snapshot.hash) {
    return toToolError("CONTENT_CONFLICT", "内容已变化，请先刷新上下文后重试", {
      currentHash: snapshot.hash,
      requestedHash: baseHash,
      snapshotId: snapshot.id,
    });
  }

  let editResult;
  try {
    editResult = applyEditOperations({
      snapshot,
      operations,
      selection,
    });
  } catch (error) {
    if (error instanceof EditEngineError) {
      return toToolError(error.code, error.message, {
        details: error.details,
        debug: {
          contentId: resolvedTarget.contentId,
          snapshotId: snapshot.id,
          documentHash: snapshot.hash,
          source: snapshot.source,
        },
      });
    }
    return toToolError("EDIT_FAILED", (error as Error).message, {
      debug: {
        contentId: resolvedTarget.contentId,
        snapshotId: snapshot.id,
        documentHash: snapshot.hash,
        source: snapshot.source,
      },
    });
  }

  return {
    success: true,
    dryRun,
    contentId: resolvedTarget.contentId,
    beforeHash: snapshot.hash,
    afterHash: editResult.hash,
    snapshotId: snapshot.id,
    patches: editResult.patches,
    markdown: editResult.markdown,
  };
};

const executeOperationsWithReviewPolicy = async (payload: {
  target?: { contentId?: number };
  baseHash?: string;
  operations: EditOperation[];
  dryRun?: boolean;
  context?: ToolExecutionContext;
  matched?: {
    start: number;
    end: number;
    confidence: number;
    matchId: string;
  };
}) => {
  const { target, baseHash, operations, dryRun = false, context, matched } = payload;

  if (dryRun) {
    return previewOperationsCore({
      target,
      baseHash,
      operations,
      dryRun,
    });
  }

  // 检查当前对话是否已有 pending 的审阅会话，防止并发提案
  const conversationKey = context?.conversationKey;
  if (conversationKey && hasPendingReviewSession(conversationKey)) {
    console.log("[executeOperationsWithReviewPolicy] 已有 pending 会话，拒绝新提案", {
      conversationKey,
    });
    return toToolError(
      "REVIEW_PENDING",
      "当前对话中已有一个待审核的修改提案，请先完成审核（确认应用、拒绝或提交修改意见）后再发起新的修改。"
    );
  }

  console.log("[executeOperationsWithReviewPolicy] 开始创建提案", {
    conversationKey,
    toolName: context?.toolName,
  });

  try {
    const proposalResult = await createContentEditProposal({
      target,
      baseHash,
      operations,
      sourceToolName: context?.toolName || "content-edit-tools",
      conversationKey: context?.conversationKey,
    });

    if (!proposalResult.success) {
      console.log("[executeOperationsWithReviewPolicy] 创建提案失败:", proposalResult);
      return proposalResult;
    }

    console.log("[executeOperationsWithReviewPolicy] 提案创建成功，进入等待审核流程", {
      proposalId: proposalResult.proposal.proposalId,
    });

    // 强制所有提案都必须经过用户审核，不再支持自动应用
    const result = await createPendingContentEditReview({
      context: context!,
      proposal: proposalResult.proposal,
      matched,
    });

    console.log("[executeOperationsWithReviewPolicy] 用户已完成审核，工具返回结果");
    return result;
  } catch (error) {
    if (error instanceof EditEngineError) {
      return toToolError(error.code, error.message, {
        details: error.details,
      });
    }
    return toToolError("EDIT_FAILED", (error as Error).message);
  }
};

const contentTargetSchema = {
  type: "object",
  description:
    "可选编辑目标。仅接受 contents 表的 contentId（不是 cardId/articleId/projectItemId）。缺省时会自动使用当前激活编辑上下文",
  properties: {
    contentId: {
      type: "number",
      description:
        "内容 ID（contents 表主键）。若你只有 cardId/articleId 等实体 ID，请先调用 resolve_entity_content_id",
    },
  } as Record<string, ToolParameterSchema>,
  required: [],
  additionalProperties: false,
} as ToolParameterSchema;

export const contentEditToolsProvider: MCPProviderDefinition = {
  id: "content-edit-tools",
  name: "内容编辑工具",
  description: "提供全文改写、范围定位、批量编辑和快速创作能力",
  defaultEnabled: true,
  tools: () => [
    {
      name: "get_active_editing_context",
      description: "获取当前激活编辑会话信息，包括 contentId、选区上下文、当前块内容、文档哈希等。",
      parameters: {
        type: "object",
        properties: {} as Record<string, ToolParameterSchema>,
        required: [],
        additionalProperties: false,
      },
      executor: async () => {
        const session = getActiveEditingSession();
        if (!session) {
          return {
            content: JSON.stringify(
              toToolError("TARGET_NOT_FOUND", "当前没有激活的编辑会话"),
              null,
              2
            ),
          };
        }

        const context = getSelectionContext({
          snapshot: session.snapshot,
          selection: session.selection,
        });

        return {
          content: JSON.stringify(
            {
              success: true,
              contentId: session.contentId,
              entityType: session.entityType,
              entityId: session.entityId,
              tabType: session.tabType,
              tabId: session.tabId,
              paneId: session.paneId,
              selection: context.selection,
              selectedMarkdown: context.selectedMarkdown,
              selectionBefore: context.selectionBefore,
              selectionAfter: context.selectionAfter,
              currentBlockMarkdown: context.currentBlockMarkdown,
              documentHash: session.snapshot.hash,
              documentLength: session.snapshot.markdown.length,
              snapshotId: session.snapshot.id,
              source: session.snapshot.source,
            },
            null,
            2
          ),
        };
      },
    },
    {
      name: "get_content_markdown",
      description:
        "根据 contentId 获取 Markdown 全文（可选 range 截断）。注意：仅支持 contents.contentId，不支持 cardId/articleId/projectItemId。",
      parameters: {
        type: "object",
        properties: {
          contentId: {
            type: "number",
            description: "contents 表中的 contentId。不是 cardId/articleId/projectItemId。",
          },
          range: {
            type: "array",
            description: "可选字符范围 [start, end]，用于截断返回内容",
            items: { type: "number" },
            minItems: 2,
            maxItems: 2,
          },
        } as Record<string, ToolParameterSchema>,
        required: ["contentId"],
        additionalProperties: false,
      },
      executor: async args => {
        const contentId = args.contentId as number;
        const range = args.range as [number, number] | undefined;

        try {
          const payload = await loadContentMarkdownPayload(contentId, range);

          return {
            content: JSON.stringify(
              {
                success: true,
                ...payload,
              },
              null,
              2
            ),
          };
        } catch (error) {
          const message = (error as Error).message;
          return {
            content: JSON.stringify(
              toToolError("GET_MARKDOWN_FAILED", message, {
                suggestion:
                  "请确认传入的是 contentId（contents 表主键），而不是 cardId/articleId/projectItemId。若你只有实体 ID，请先调用 resolve_entity_content_id。",
              }),
              null,
              2
            ),
          };
        }
      },
    },
    {
      name: "resolve_entity_content_id",
      description:
        "将实体 ID 转换为 contentId。支持 card/article/project-item 三种实体，用于后续编辑工具。",
      parameters: {
        type: "object",
        properties: {
          entityType: {
            type: "string",
            enum: ["card", "article", "project-item", "question-answer"],
            description:
              "实体类型：card(卡片)、article(文章)、project-item(项目文档项)、question-answer(问题答案，entityId 即 contentId)",
          },
          entityId: {
            type: "number",
            description: "对应实体的主键 ID",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["entityType", "entityId"],
        additionalProperties: false,
      },
      executor: async args => {
        const entityType = args.entityType as
          "card" | "article" | "project-item" | "question-answer";
        const entityId = args.entityId as number;

        try {
          if (entityType === "card") {
            const card = await getCardById(entityId);
            return {
              content: JSON.stringify(
                {
                  success: true,
                  entityType,
                  entityId,
                  contentId: card.contentId,
                },
                null,
                2
              ),
            };
          }

          if (entityType === "article") {
            const article = await findOneArticle(entityId);
            return {
              content: JSON.stringify(
                {
                  success: true,
                  entityType,
                  entityId,
                  contentId: article.contentId,
                },
                null,
                2
              ),
            };
          }

          if (entityType === "project-item") {
            const item = await getProjectItemById(entityId);
            if (!item) {
              return {
                content: JSON.stringify(
                  toToolError("ENTITY_NOT_FOUND", `未找到 project-item ${entityId}`),
                  null,
                  2
                ),
              };
            }
            return {
              content: JSON.stringify(
                {
                  success: true,
                  entityType,
                  entityId,
                  contentId: item.contentId,
                },
                null,
                2
              ),
            };
          }

          if (entityType === "question-answer") {
            const content = await getContentById(entityId);
            if (!content) {
              return {
                content: JSON.stringify(
                  toToolError("ENTITY_NOT_FOUND", `未找到 question-answer ${entityId}`),
                  null,
                  2
                ),
              };
            }

            return {
              content: JSON.stringify(
                {
                  success: true,
                  entityType,
                  entityId,
                  contentId: content.id,
                },
                null,
                2
              ),
            };
          }

          throw new Error(`不支持的实体类型：${entityType}`);
        } catch (error) {
          return {
            content: JSON.stringify(
              toToolError("RESOLVE_CONTENT_ID_FAILED", (error as Error).message, {
                entityType,
                entityId,
              }),
              null,
              2
            ),
          };
        }
      },
    },
    {
      name: "find_content_ranges",
      description:
        "根据用户提供的文本在当前内容中定位候选范围，支持 exact/normalized/fuzzy 三种模式。",
      parameters: {
        type: "object",
        properties: {
          target: contentTargetSchema,
          queryText: {
            type: "string",
            description: "要定位的文本片段",
          },
          matchMode: {
            type: "string",
            enum: ["exact", "normalized", "fuzzy"],
            description: "匹配模式，默认 exact",
          },
          occurrence: {
            type: "number",
            description: "可选，第 N 次出现（从 1 开始）",
          },
          beforeHint: {
            type: "string",
            description: "可选，前文提示，用于消歧",
          },
          afterHint: {
            type: "string",
            description: "可选，后文提示，用于消歧",
          },
          maxCandidates: {
            type: "number",
            description: "最大返回候选数，默认 10",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["queryText"],
        additionalProperties: false,
      },
      executor: async args => {
        const queryText = args.queryText as string;
        const matchMode = args.matchMode as "exact" | "normalized" | "fuzzy" | undefined;
        const occurrence = args.occurrence as number | undefined;
        const beforeHint = args.beforeHint as string | undefined;
        const afterHint = args.afterHint as string | undefined;
        const maxCandidates = args.maxCandidates as number | undefined;
        const target = args.target as { contentId?: number } | undefined;

        try {
          const resolved = await resolveContentTarget({
            contentId: target?.contentId,
          });
          const { snapshot } = await loadSnapshotForContent(resolved.contentId);
          const matches = findContentRanges(snapshot, {
            queryText,
            matchMode,
            occurrence,
            beforeHint,
            afterHint,
            maxCandidates,
          });

          return {
            content: JSON.stringify(
              {
                success: true,
                contentId: resolved.contentId,
                snapshotId: snapshot.id,
                documentHash: snapshot.hash,
                candidates: matches,
              },
              null,
              2
            ),
          };
        } catch (error) {
          return {
            content: JSON.stringify(toToolError("FIND_FAILED", (error as Error).message), null, 2),
          };
        }
      },
    },
    {
      name: "apply_content_edit_operations",
      description:
        "高级工具：对内容执行批量编辑（insert/delete/replace）。建议优先使用 replace_content_by_text 或 rewrite_content_full。注意：调用此工具后，修改不会立即生效，而是会生成一个待用户审阅的提案。只有用户确认应用后，修改才会真正写入。在用户明确确认之前，你不应假设之前的修改已经被应用，也不应为此调用 get_content_markdown 等工具去确认当前内容。",
      execution: reviewToolExecution,
      parameters: {
        type: "object",
        properties: {
          target: contentTargetSchema,
          baseHash: {
            type: "string",
            description: "可选，快照哈希。传入后会做严格冲突校验。",
          },
          dryRun: {
            type: "boolean",
            description: "可选，仅预览不落库。",
          },
          operations: {
            type: "array",
            description: "编辑操作数组",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                op: {
                  type: "string",
                  enum: ["insert", "delete", "replace"],
                },
                locator: {
                  type: "object",
                  description:
                    "定位器：kind 可取 full-document/markdown-range/slate-path/active-selection/active-block/match-id",
                  properties: {
                    kind: { type: "string" },
                    start: {
                      type: "object",
                      properties: {
                        line: { type: "number" },
                        ch: { type: "number" },
                      } as Record<string, ToolParameterSchema>,
                    },
                    end: {
                      type: "object",
                      properties: {
                        line: { type: "number" },
                        ch: { type: "number" },
                      } as Record<string, ToolParameterSchema>,
                    },
                    path: {
                      type: "array",
                      items: { type: "number" },
                    },
                    matchId: { type: "string" },
                  } as Record<string, ToolParameterSchema>,
                },
                text: { type: "string" },
                position: {
                  type: "string",
                  enum: ["start", "end", "before", "after"],
                },
                expectedText: { type: "string" },
              } as Record<string, ToolParameterSchema>,
              required: ["op", "locator"],
              additionalProperties: false,
            } as ToolParameterSchema,
          } as ToolParameterSchema,
        } as Record<string, ToolParameterSchema>,
        required: ["operations"],
        additionalProperties: false,
      },
      executor: async (args, context) => {
        const operations = args.operations as EditOperation[];
        const baseHash = args.baseHash as string | undefined;
        const dryRun = args.dryRun as boolean | undefined;
        const target = args.target as { contentId?: number } | undefined;

        if (!Array.isArray(operations) || operations.length === 0) {
          return {
            content: JSON.stringify(
              toToolError("INVALID_ARGUMENT", "operations 不能为空"),
              null,
              2
            ),
            isParameterError: true,
          };
        }

        const result = await executeOperationsWithReviewPolicy({
          target,
          baseHash,
          operations,
          dryRun,
          context,
        });

        if ("content" in result && typeof result.content === "string") {
          return result;
        }

        return {
          content: JSON.stringify(result, null, 2),
        };
      },
    },
    {
      name: "replace_content_by_text",
      description:
        "稳健替换工具：先按文本定位，再执行单次 replace。优先用于侧边对话的精准改写场景。注意：调用此工具后，修改不会立即生效，而是会生成一个待用户审阅的提案。只有用户确认应用后，修改才会真正写入。在用户明确确认之前，你不应假设之前的修改已经被应用，也不应为此调用 get_content_markdown 等工具去确认当前内容。",
      execution: reviewToolExecution,
      parameters: {
        type: "object",
        properties: {
          target: contentTargetSchema,
          searchText: {
            type: "string",
            description: "需要替换的原始文本",
          },
          replaceText: {
            type: "string",
            description: "替换后的文本",
          },
          matchMode: {
            type: "string",
            enum: ["exact", "normalized", "fuzzy"],
            description: "匹配模式，默认 exact",
          },
          occurrence: {
            type: "number",
            description: "可选，第 N 次出现（从 1 开始）",
          },
          beforeHint: {
            type: "string",
            description: "可选，前文提示用于消歧",
          },
          afterHint: {
            type: "string",
            description: "可选，后文提示用于消歧",
          },
          dryRun: {
            type: "boolean",
            description: "可选，仅预览不落库",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["searchText", "replaceText"],
        additionalProperties: false,
      },
      executor: async (args, context) => {
        const target = args.target as { contentId?: number } | undefined;
        const searchText = args.searchText as string;
        const replaceText = args.replaceText as string;
        const matchMode = args.matchMode as "exact" | "normalized" | "fuzzy" | undefined;
        const occurrence = args.occurrence as number | undefined;
        const beforeHint = args.beforeHint as string | undefined;
        const afterHint = args.afterHint as string | undefined;
        const dryRun = args.dryRun as boolean | undefined;

        if (!searchText?.trim()) {
          return {
            content: JSON.stringify(
              toToolError("INVALID_ARGUMENT", "searchText 不能为空"),
              null,
              2
            ),
            isParameterError: true,
          };
        }

        try {
          const resolved = await resolveContentTarget({
            contentId: target?.contentId,
          });
          const { snapshot } = await loadSnapshotForContent(resolved.contentId);

          const matches = findContentRanges(snapshot, {
            queryText: searchText,
            matchMode,
            occurrence,
            beforeHint,
            afterHint,
            maxCandidates: 5,
          });

          if (matches.length === 0) {
            return {
              content: JSON.stringify(
                toToolError("NO_MATCH_FOUND", "未找到可替换的目标文本", {
                  contentId: resolved.contentId,
                  snapshotId: snapshot.id,
                  documentHash: snapshot.hash,
                }),
                null,
                2
              ),
            };
          }

          if (!occurrence && matches.length > 1) {
            return {
              content: JSON.stringify(
                toToolError(
                  "AMBIGUOUS_MATCH",
                  "匹配到多个候选，请提供 occurrence 或 beforeHint/afterHint 消歧",
                  {
                    contentId: resolved.contentId,
                    snapshotId: snapshot.id,
                    candidates: matches.map(item => ({
                      matchId: item.matchId,
                      start: item.start,
                      end: item.end,
                      confidence: item.confidence,
                      excerpt: item.excerpt,
                    })),
                  }
                ),
                null,
                2
              ),
            };
          }

          const pick = matches[0];
          const actualText = snapshot.markdown.slice(pick.start, pick.end);
          const start = offsetToMarkdownPoint(pick.start, snapshot.lineOffsets);
          const end = offsetToMarkdownPoint(pick.end, snapshot.lineOffsets);

          const result = await executeOperationsWithReviewPolicy({
            target: { contentId: resolved.contentId },
            baseHash: snapshot.hash,
            dryRun,
            context,
            matched: {
              start: pick.start,
              end: pick.end,
              confidence: pick.confidence,
              matchId: pick.matchId,
            },
            operations: [
              {
                id: "replace-by-text",
                op: "replace",
                locator: {
                  kind: "markdown-range",
                  start,
                  end,
                },
                expectedText: actualText,
                text: replaceText,
              },
            ],
          });

          if ("content" in result && typeof result.content === "string") {
            return result;
          }

          return {
            content: JSON.stringify(
              {
                ...result,
                matched: {
                  start: pick.start,
                  end: pick.end,
                  confidence: pick.confidence,
                  matchId: pick.matchId,
                },
              },
              null,
              2
            ),
          };
        } catch (error) {
          return {
            content: JSON.stringify(
              toToolError("REPLACE_BY_TEXT_FAILED", (error as Error).message),
              null,
              2
            ),
          };
        }
      },
    },
    {
      name: "rewrite_content_full",
      description:
        "全文替换快捷工具，等价于对 full-document 执行一次 replace。必须显式提供 contentId。注意：调用此工具后，修改不会立即生效，而是会生成一个待用户审阅的提案。只有用户确认应用后，修改才会真正写入。在用户明确确认之前，你不应假设之前的修改已经被应用，也不应为此调用 get_content_markdown 等工具去确认当前内容。",
      execution: reviewToolExecution,
      parameters: {
        type: "object",
        properties: {
          contentId: {
            type: "number",
            description: "必填。contents 表中的 contentId。不是 cardId/articleId/projectItemId。",
          },
          markdown: {
            type: "string",
            description: "完整替换后的 Markdown 内容",
          },
          baseHash: {
            type: "string",
            description: "可选，快照哈希",
          },
          dryRun: {
            type: "boolean",
            description: "可选，仅预览不落库",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["contentId", "markdown"],
        additionalProperties: false,
      },
      executor: async (args, context) => {
        const contentId = args.contentId as number;
        const markdown = args.markdown as string;
        const baseHash = args.baseHash as string | undefined;
        const dryRun = args.dryRun as boolean | undefined;

        const result = await executeOperationsWithReviewPolicy({
          target: { contentId },
          baseHash,
          dryRun,
          context,
          operations: [
            {
              id: "full-rewrite",
              op: "replace",
              locator: { kind: "full-document" },
              text: markdown,
            },
          ],
        });

        if ("content" in result && typeof result.content === "string") {
          return result;
        }

        return {
          content: JSON.stringify(result, null, 2),
        };
      },
    },
    {
      name: "create_card_and_activate_tab",
      description:
        "根据 Markdown 创建卡片并自动激活卡片详情 Tab。返回 card.id 与 contentId（后续编辑请使用 contentId）。",
      parameters: {
        type: "object",
        properties: {
          markdown: {
            type: "string",
            description: "卡片正文 Markdown",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "可选标签数组",
          },
          category: {
            type: "string",
            enum: [
              ECardCategory.Temporary,
              ECardCategory.Permanent,
              ECardCategory.Theme,
              ECardCategory.Literature,
            ],
            description: "卡片分类，默认 temporary",
          },
          titleHint: {
            type: "string",
            description: "可选，仅用于调用侧记录，不参与创建字段",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["markdown"],
        additionalProperties: false,
      },
      executor: async args => {
        const markdown = args.markdown as string;
        const tags = (args.tags as string[] | undefined) || [];
        const category = (args.category as ECardCategory | undefined) || ECardCategory.Temporary;

        try {
          const content = importFromMarkdown(markdown);
          const card = await createCard({
            content,
            tags,
            links: [],
            category,
            count: getContentLength(content),
            isTop: false,
          });

          defaultCardEventBus.publish("card:created", {
            card,
            sourceUuid: "content-edit-tools",
          });

          let navigationError: string | undefined;
          try {
            openPage("card-detail", { id: card.id });
          } catch (error) {
            navigationError = error instanceof Error ? error.message : "打开卡片失败";
          }

          return {
            content: JSON.stringify(
              {
                success: true,
                contentId: card.contentId,
                card: {
                  id: card.id,
                  contentId: card.contentId,
                  category: card.category,
                  tags: card.tags,
                },
                activatedPage: navigationError ? null : { key: "card-detail", id: card.id },
                navigationError,
              },
              null,
              2
            ),
          };
        } catch (error) {
          return {
            content: JSON.stringify(
              toToolError("CREATE_CARD_FAILED", (error as Error).message),
              null,
              2
            ),
          };
        }
      },
    },
    {
      name: "create_article_and_activate_tab",
      description:
        "根据 Markdown 创建文章并自动激活文章详情 Tab。返回 article.id 与 contentId（后续编辑请使用 contentId）。",
      parameters: {
        type: "object",
        properties: {
          markdown: {
            type: "string",
            description: "文章正文 Markdown",
          },
          title: {
            type: "string",
            description: "可选标题，默认“默认文章标题”",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "可选标签数组",
          },
          author: {
            type: "string",
            description: "可选作者",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["markdown"],
        additionalProperties: false,
      },
      executor: async args => {
        const markdown = args.markdown as string;
        const title = (args.title as string | undefined) || "默认文章标题";
        const tags = (args.tags as string[] | undefined) || [];
        const author = (args.author as string | undefined) || "";

        try {
          const content = importFromMarkdown(markdown);
          const article = await createArticle({
            title,
            author,
            tags,
            links: [],
            content,
            bannerBg: "",
            bannerPosition: "center",
            isTop: false,
            isDelete: false,
            count: getContentLength(content),
          });

          defaultArticleEventBus.publish("article:created", {
            article,
            sourceUuid: "content-edit-tools",
          });

          let navigationError: string | undefined;
          try {
            openPage("article-detail", { id: article.id });
          } catch (error) {
            navigationError = error instanceof Error ? error.message : "打开文章失败";
          }

          return {
            content: JSON.stringify(
              {
                success: true,
                contentId: article.contentId,
                article: {
                  id: article.id,
                  contentId: article.contentId,
                  title: article.title,
                  tags: article.tags,
                },
                activatedPage: navigationError ? null : { key: "article-detail", id: article.id },
                navigationError,
              },
              null,
              2
            ),
          };
        } catch (error) {
          return {
            content: JSON.stringify(
              toToolError("CREATE_ARTICLE_FAILED", (error as Error).message),
              null,
              2
            ),
          };
        }
      },
    },
  ],
};
