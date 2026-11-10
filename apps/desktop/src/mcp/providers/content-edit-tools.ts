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
  getSnapshot,
  getContentEditProposal,
  askAboutContent,
  applyDirectSuggestions,
  loadSnapshotForContent,
  resolveContentTarget,
  resolveLocatorToRange,
  hasPendingReviewSession,
} from "@/services/content-editing";
import type { EditOperation } from "@/services/content-editing";
import type { ToolExecutionContext } from "@/types";
import { loadContentMarkdownPayload } from "./content-read-utils";
import { getToolPermissionMode } from "@/services/tool-permission/policy";
import { requiresApproval } from "@/services/tool-permission/mode";
import { getChatDatabase } from "@/services/chatDatabase";
import { presenceAgentOf, reportAgentPresence } from "@/services/agent-presence";
import { bindDatabaseCommands } from "@/services/command-context";
import { getAgentPermission } from "@/commands/content";
import { isElectron } from "@/electron";
import type { Descendant } from "slate";

const reviewToolExecution = {
  timeoutMs: null,
} as const;

function findBlockPath(nodes: Descendant[], blockId: string): number[] | undefined {
  for (const [index, node] of nodes.entries()) {
    if (!("children" in node)) continue;
    if ("collabId" in node && node.collabId === blockId) return [index];
    const path = findBlockPath(node.children, blockId);
    if (path) return [index, ...path];
  }
}

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
  snapshotId?: string;
  operations: EditOperation[];
  dryRun?: boolean;
  context?: ToolExecutionContext;
}) => {
  const { target, baseHash, snapshotId, operations, dryRun = false, context } = payload;
  const resolvedTarget = await resolveContentTarget(
    {
      contentId: target?.contentId,
    },
    context
  );
  const captured = snapshotId && getSnapshot(snapshotId);
  if (
    snapshotId &&
    (!captured ||
      (isElectron && !captured.editState) ||
      (captured.editState &&
        (captured.editState.contentId !== resolvedTarget.contentId ||
          captured.editState.databaseName !==
            (context?.databaseName ?? getChatDatabase()).replace(/\.db$/, ""))))
  )
    return toToolError("SNAPSHOT_EXPIRED", "正文快照已失效，请重新读取");
  const { snapshot } = captured
    ? { snapshot: captured }
    : await loadSnapshotForContent(resolvedTarget.contentId, context);
  const session =
    !context?.databaseName || context.databaseName.replace(/\.db$/, "") === getChatDatabase()
      ? getActiveEditingSessionByContentId(resolvedTarget.contentId)
      : undefined;
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
  snapshotId?: string;
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
  const { target, baseHash, snapshotId, operations, dryRun = false, context, matched } = payload;

  if (dryRun) {
    return previewOperationsCore({
      context,
      target,
      baseHash,
      snapshotId,
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

  // 工具权限模式（D-060）为自动允许编辑 / 跳过确认时按直接改落地；反馈续改（forceReview）始终走审阅
  const forceReview = context?.toolContext?.flags?.forceReview === true;
  const autoApply = !forceReview && !requiresApproval("write", getToolPermissionMode());
  const agent = presenceAgentOf(context);
  try {
    const proposalResult = await createContentEditProposal({
      databaseName: context?.databaseName,
      signal: context?.signal,
      target,
      baseHash,
      snapshotId,
      operations,
      sourceToolName: context?.toolName || "content-edit-tools",
      agentId: context?.conversationKey?.split(":subagent:")[1],
      agentLabel: agent,
      conversationKey: context?.conversationKey,
      // Agent × 正文的权限：只读拒绝；直接改或全局自动应用时实时落地；其余等用户逐条处理
      resolveMode: async contentId => {
        const level = isElectron
          ? await bindDatabaseCommands(
              { getAgentPermission },
              { databaseName: context?.databaseName }
            ).getAgentPermission(contentId, agent)
          : "suggest";
        if (level === "readonly") return "readonly";
        return level === "direct" || (autoApply && !forceReview) ? "direct" : "suggest";
      },
    });

    if (!proposalResult.success) {
      console.log("[executeOperationsWithReviewPolicy] 创建提案失败:", proposalResult);
      return proposalResult;
    }
    const { contentId } = proposalResult.proposal;
    // 光标停在第一条建议的末尾：打开正文就能看到它刚在哪里动过笔
    const first = proposalResult.suggestions?.find(item => item.edit.kind === "text")?.edit;
    const caret =
      first?.kind === "text" ? { blockId: first.blockId, position: first.end } : undefined;

    if (proposalResult.mode === "direct") {
      reportAgentPresence(context, contentId, { status: "busy", action: "正在改正文", caret });
      const result = proposalResult.proposal.suggestions
        ? await applyDirectSuggestions(
            proposalResult.proposal,
            context?.signal,
            context?.toolContext?.executionId,
            !autoApply
          )
        : await autoApplyContentEditProposal(proposalResult.proposal, context?.signal);
      reportAgentPresence(context, contentId, { status: "busy", action: "改好了，接着做" });
      return result;
    }
    const count =
      proposalResult.suggestions?.length ?? proposalResult.proposal.diffSummary.patchCount;
    reportAgentPresence(context, contentId, {
      status: "waiting",
      action: `等你处理 ${count} 条建议`,
      caret,
    });
    const result = await createPendingContentEditReview({
      context: context!,
      proposal: proposalResult.proposal,
      matched,
    });
    reportAgentPresence(context, contentId, { status: "busy", action: "看过你的处理，接着做" });

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
      risk: "read",
      description:
        "根据 contentId 获取 Markdown 正文。可按 range 截断，或传入冲突结果的 blockId 只重新读取目标块。仅支持 contents.contentId。",
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
          blockId: { type: "string", description: "冲突返回的稳定块 ID，与 range 二选一" },
        } as Record<string, ToolParameterSchema>,
        required: ["contentId"],
        additionalProperties: false,
      },
      executor: async (args, context) => {
        const contentId = args.contentId as number;
        const range = args.range as [number, number] | undefined;
        reportAgentPresence(context, contentId, {
          status: "busy",
          action: typeof args.blockId === "string" ? "正在重读这段" : "正在读正文",
          ...(typeof args.blockId === "string" ? { block: args.blockId } : {}),
        });

        try {
          if (typeof args.blockId === "string") {
            if (range) throw new Error("blockId 与 range 不能同时提供");
            const { snapshot } = await loadSnapshotForContent(contentId, context, true);
            const path = findBlockPath(snapshot.content, args.blockId);
            if (!path)
              return {
                content: JSON.stringify(
                  toToolError("ANCHOR_CHANGED", "原块已不存在，请读取当前正文定位")
                ),
              };
            const { start, end } = resolveLocatorToRange({
              locator: { kind: "slate-path", path },
              snapshot,
              selection: null,
            });
            return {
              content: JSON.stringify({
                success: true,
                contentId,
                blockId: args.blockId,
                snapshotId: snapshot.id,
                range: { start, end },
                markdown: snapshot.markdown.slice(start, end),
              }),
            };
          }
          const payload = await loadContentMarkdownPayload(contentId, range, context, true);

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
      risk: "read",
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
      executor: async (args, context) => {
        const queryText = args.queryText as string;
        const matchMode = args.matchMode as "exact" | "normalized" | "fuzzy" | undefined;
        const occurrence = args.occurrence as number | undefined;
        const beforeHint = args.beforeHint as string | undefined;
        const afterHint = args.afterHint as string | undefined;
        const maxCandidates = args.maxCandidates as number | undefined;
        const target = args.target as { contentId?: number } | undefined;

        try {
          const resolved = await resolveContentTarget(
            {
              contentId: target?.contentId,
            },
            context
          );
          reportAgentPresence(context, resolved.contentId, {
            status: "busy",
            action: `正在找「${queryText.replace(/\s+/g, " ").slice(0, 16)}」`,
          });
          const { snapshot } = await loadSnapshotForContent(resolved.contentId, context, true);
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
      name: "ask_about_content",
      risk: "read",
      description:
        "在正文的一段原句上向用户提问，并给出 2–4 个可点的答案；工具会等用户在正文批注或对话卡片里作答后返回回答。拿不准改法、需要用户取舍时先用它问，不要用「提改动再被退回」去试探。quote 必须是正文里的原句（可先用 find_content_ranges 确认）。",
      execution: reviewToolExecution,
      parameters: {
        type: "object",
        properties: {
          target: contentTargetSchema,
          quote: { type: "string", description: "问题所针对的正文原句，问题会锚在这里" },
          question: { type: "string", description: "一句话的问题，如「第 ② 处你想怎么写？」" },
          options: {
            type: "array",
            description: "可点的答案，2–4 个，短句；用户也可以自己写",
            items: { type: "string" },
            maxItems: 4,
          },
        } as Record<string, ToolParameterSchema>,
        required: ["quote", "question"],
        additionalProperties: false,
      },
      executor: async (args, context) => {
        try {
          const result = await askAboutContent({
            context,
            contentId: (args.target as { contentId?: number } | undefined)?.contentId,
            quote: String(args.quote ?? ""),
            question: String(args.question ?? ""),
            options: Array.isArray(args.options) ? args.options.map(String) : [],
          });
          return { content: JSON.stringify(result, null, 2) };
        } catch (error) {
          return {
            content: JSON.stringify(toToolError("ASK_FAILED", (error as Error).message), null, 2),
          };
        }
      },
    },
    {
      name: "apply_content_edit_operations",
      risk: "write",
      description:
        "对正文执行批量编辑（insert/delete/replace），也是全文改写的唯一入口。先用 get_content_markdown 或 find_content_ranges 读取，传入 snapshotId；精确替换使用 match-id，整篇改写使用 full-document。SCOPE_CONFLICT 时用返回的 blockId 调用 get_content_markdown 重读目标，再基于当前正文决定是否生成新操作。COMMIT_PENDING 时仅传 resumeProposalId 查询或补交原请求。手动确认模式下工具会等待审阅。",
      execution: reviewToolExecution,
      parameters: {
        type: "object",
        properties: {
          target: contentTargetSchema,
          snapshotId: { type: "string", description: "读取正文或查找范围时返回的 snapshotId" },
          resumeProposalId: {
            type: "string",
            description: "提交结果未确认时，复用原请求，不传 operations",
          },
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
                reason: {
                  type: "string",
                  description:
                    "一句话说明为什么这样改，有出处时附上来源（如「原句没说清限制。出处：…」）；会显示在这条建议旁",
                },
              } as Record<string, ToolParameterSchema>,
              required: ["op", "locator"],
              additionalProperties: false,
            } as ToolParameterSchema,
          } as ToolParameterSchema,
        } as Record<string, ToolParameterSchema>,
        additionalProperties: false,
      },
      executor: async (args, context) => {
        if (typeof args.resumeProposalId === "string") {
          const proposal = getContentEditProposal(args.resumeProposalId);
          if (
            args.operations !== undefined ||
            !proposal?.commitPending ||
            proposal.conversationKey !== context?.conversationKey ||
            proposal.databaseName?.replace(/\.db$/, "") !==
              (context?.databaseName ?? getChatDatabase()).replace(/\.db$/, "")
          ) {
            return {
              content: JSON.stringify(toToolError("INVALID_ARGUMENT", "没有可恢复的原提交")),
            };
          }
          return autoApplyContentEditProposal(
            proposal,
            context?.signal,
            context?.toolContext?.executionId,
            requiresApproval("write", getToolPermissionMode())
          );
        }
        const operations = args.operations as EditOperation[];
        const baseHash = args.baseHash as string | undefined;
        const snapshotId = args.snapshotId as string | undefined;
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
          snapshotId,
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
  ],
};
