import type { ToolParameterSchema } from "@/types";
import type { MCPProviderDefinition } from "./types";
import {
  applyEditOperations,
  autoApplyContentEditProposal,
  createPendingContentEditReview,
  createContentEditProposal,
  EditEngineError,
  findContentRanges,
  getActiveEditingSessionByContentId,
  loadSnapshotForContent,
  resolveContentTarget,
  hasPendingReviewSession,
} from "@/services/content-editing";
import type { EditOperation } from "@/services/content-editing";
import { offsetToMarkdownPoint } from "@/services/content-editing";
import type { ToolExecutionContext } from "@/types";
import { loadContentMarkdownPayload } from "./content-read-utils";
import { getToolPermissionMode } from "@/services/tool-permission/policy";
import { requiresApproval } from "@/services/tool-permission/mode";

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

    // 工具权限模式（D-060）：手动确认走审阅卡；自动允许编辑 / 跳过确认直接应用。
    // 反馈续改（forceReview）始终走审阅卡
    const forceReview = context?.toolContext?.flags?.forceReview === true;
    if (!forceReview && !requiresApproval("write", getToolPermissionMode())) {
      return autoApplyContentEditProposal(proposalResult.proposal);
    }
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
      risk: "write",
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
      risk: "write",
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
      risk: "write",
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
  ],
};
