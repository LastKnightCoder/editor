import { App } from "antd";
import { useMemo, useState } from "react";
import type React from "react";
import type { ToolCallCustomRendererProps } from "./types";
import {
  ToolBadge,
  ToolCard,
  ToolCardBody,
  ToolCardHeader,
  ToolMutedText,
} from "./ui";
import { Editor } from "@tau/editor/src";
import {
  getSnapshot,
  markdownToContent,
  restoreContentCheckpoint,
  submitContentEditReviewDecisionByExecution,
  type ContentEditProposalRecord,
  type ContentEditRendererPayload,
  useContentEditReviewSessionStore,
  useContentEditReviewStore,
} from "@/services/content-editing";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import { DiffHighlightedEditor } from "./DiffHighlightedEditor";
import {
  CompactSummary,
  ChangePreviewCard,
  FeedbackTemplates,
} from "./change-preview-components";
import { generateChangePreviews } from "@/utils/review-change-preview";
import { buildMergedReviewContent } from "@/utils/review-merged-content";

type ReviewResultPayload = {
  kind?: "content-edit-review-result";
  type: "content-edit-review-result";
  action: "applied" | "rejected" | "feedback";
  submittedAt: number;
  contentId: number;
  message: string;
  proposalId: string;
  conversationKey: string;
  checkpointId?: string;
  feedback?: string;
  proposal?: {
    sourceToolName: string;
    proposedMarkdown?: string;
    diffSummary: ContentEditRendererPayload["diffSummary"];
    patches: ContentEditRendererPayload["patches"];
  };
};

const sourceLabelMap: Record<string, string> = {
  replace_content_by_text: "局部润色",
  rewrite_content_full: "全文改写",
  apply_content_edit_operations: "结构编辑",
};

const actionLabelMap: Record<string, string> = {
  applied: "已应用",
  rejected: "已拒绝",
  feedback: "已提交修改意见",
};

const parseOutputResult = (output?: string): ReviewResultPayload | null => {
  if (!output) return null;
  try {
    const parsed = JSON.parse(output) as ReviewResultPayload;
    return parsed?.type === "content-edit-review-result" ? parsed : null;
  } catch {
    return null;
  }
};

const getMetadataResult = (
  execution: ToolCallCustomRendererProps["execution"],
): ReviewResultPayload | null => {
  const metadata = execution.metadata;
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const render =
    metadata.render && typeof metadata.render === "object"
      ? (metadata.render as Record<string, unknown>)
      : null;
  const payload =
    render?.payload && typeof render.payload === "object"
      ? (render.payload as ReviewResultPayload)
      : null;

  if (
    payload &&
    (payload.kind === "content-edit-review-result" ||
      payload.type === "content-edit-review-result")
  ) {
    return payload;
  }

  return null;
};

const SecondaryButton = ({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
  >
    {children}
  </button>
);

const PrimaryButton = ({
  children,
  onClick,
  disabled,
  tone = "sky",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "sky" | "rose";
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={`rounded-xl px-4 py-2 text-sm text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
      tone === "rose"
        ? "bg-rose-500 hover:bg-rose-600"
        : "bg-sky-600 hover:bg-sky-700"
    }`}
  >
    {children}
  </button>
);

const SectionShell = ({
  isDark,
  title,
  children,
}: {
  isDark: boolean;
  title: string | React.ReactNode;
  children: React.ReactNode;
}) => (
  <div
    className={`rounded-2xl border ${
      isDark
        ? "border-white/10 bg-slate-950/40"
        : "border-slate-200 bg-slate-50/80"
    }`}
  >
    <div
      className={`border-b px-4 py-3 text-sm font-medium ${
        isDark
          ? "border-white/10 text-slate-100"
          : "border-slate-200 text-slate-800"
      }`}
    >
      {title}
    </div>
    <div className="px-4 py-3">{children}</div>
  </div>
);

const ContentEditProposalRenderer = ({
  execution,
  isDark,
}: ToolCallCustomRendererProps) => {
  const { message, modal } = App.useApp();
  const dynamicExtensions = useDynamicExtensionsStore(
    (state) => state.extensions,
  );
  const [busyAction, setBusyAction] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [showDiffView, setShowDiffView] = useState(true);
  const [expandedPreview, setExpandedPreview] = useState(false);
  const outputResult =
    getMetadataResult(execution) || parseOutputResult(execution.output);

  const session = useContentEditReviewSessionStore((state) =>
    state.findRecordByExecution({
      toolCallId: execution.toolCallId,
      rawInput: execution.input,
      timestamp: execution.timestamp,
    }),
  );
  const proposalId = session?.proposalId || outputResult?.proposalId;
  const conversationKey =
    session?.conversationKey || outputResult?.conversationKey;

  const liveProposal = useContentEditReviewStore((state) =>
    proposalId ? state.proposals[proposalId] : undefined,
  );
  const currentPermission = useContentEditReviewStore((state) =>
    conversationKey ? state.permissions[conversationKey] : undefined,
  );

  const proposal = useMemo(() => {
    if (session) {
      const merged = {
        ...session.payload,
        ...liveProposal,
        currentPermission:
          currentPermission || session.payload.currentPermission,
      };
      return merged as ContentEditRendererPayload &
        Partial<ContentEditProposalRecord>;
    }

    if (!outputResult?.proposal) {
      return null;
    }

    const merged = {
      kind: "content-edit-proposal" as const,
      proposalId: outputResult.proposalId,
      conversationKey: outputResult.conversationKey,
      contentId: outputResult.contentId,
      sourceToolName: outputResult.proposal.sourceToolName,
      status:
        (liveProposal?.status as ContentEditRendererPayload["status"]) ||
        (outputResult.action === "applied" ? "applied" : "rejected"),
      beforeHash: liveProposal?.beforeHash || "",
      afterHash: liveProposal?.afterHash || "",
      snapshotId: liveProposal?.snapshotId || "",
      diffSummary: outputResult.proposal.diffSummary,
      patches: outputResult.proposal.patches,
      checkpointId: outputResult.checkpointId || liveProposal?.checkpointId,
      currentPermission: currentPermission || "review_required",
      targetSource: liveProposal?.targetSource || "active-session",
      lastError: liveProposal?.lastError,
      createdAt: liveProposal?.createdAt || outputResult.submittedAt,
      updatedAt: liveProposal?.updatedAt || outputResult.submittedAt,
      proposedMarkdown: outputResult.proposal.proposedMarkdown,
    };
    return merged as ContentEditRendererPayload &
      Partial<ContentEditProposalRecord>;
  }, [
    conversationKey,
    currentPermission,
    liveProposal,
    outputResult,
    proposalId,
    session,
  ]);

  const previewContent = useMemo(() => {
    if (!proposal?.proposedMarkdown) {
      return [];
    }
    return markdownToContent(proposal.proposedMarkdown);
  }, [proposal?.proposedMarkdown]);

  const mergedReviewContent = useMemo(() => {
    if (!proposal?.proposedMarkdown) return null;
    const beforeMarkdown =
      proposal.beforeMarkdown ||
      (proposal.snapshotId ? getSnapshot(proposal.snapshotId)?.markdown : null);
    if (!beforeMarkdown) {
      return null;
    }

    try {
      return buildMergedReviewContent({
        beforeMarkdown,
        afterMarkdown: proposal.proposedMarkdown,
        patches: proposal.patches,
      }).content;
    } catch (error) {
      console.warn("构建审阅 merged 内容失败:", error);
      return null;
    }
  }, [proposal?.patches, proposal?.proposedMarkdown, proposal?.snapshotId]);

  // 生成改动预览
  const changePreviews = useMemo(() => {
    if (!proposal?.patches) return [];
    return generateChangePreviews(proposal.patches);
  }, [proposal?.patches]);

  const withBusy = async (action: string, runner: () => Promise<void>) => {
    setBusyAction(action);
    try {
      await runner();
    } finally {
      setBusyAction("");
    }
  };

  if (!proposal) {
    if (outputResult) {
      return (
        <ToolCard isDark={isDark}>
          <ToolCardHeader isDark={isDark}>
            <div className="flex items-center gap-2">
              <div
                className={`min-w-0 flex-1 text-sm font-medium ${
                  isDark ? "text-slate-100" : "text-slate-800"
                }`}
              >
                {actionLabelMap[outputResult.action] || "已处理"}
              </div>
              <ToolBadge isDark={isDark}>{outputResult.message}</ToolBadge>
            </div>
          </ToolCardHeader>
          {outputResult.feedback ? (
            <ToolCardBody>
              <ToolMutedText isDark={isDark} className="break-words">
                已记录的修改意见：{outputResult.feedback}
              </ToolMutedText>
            </ToolCardBody>
          ) : null}
        </ToolCard>
      );
    }

    return (
      <ToolCard isDark={isDark}>
        <ToolCardHeader isDark={isDark}>
          <div
            className={`text-sm font-medium ${
              isDark ? "text-slate-100" : "text-slate-800"
            }`}
          >
            内容修改处理中
          </div>
          <ToolMutedText isDark={isDark} className="mt-2">
            正在准备审阅结果，请稍候。
          </ToolMutedText>
        </ToolCardHeader>
      </ToolCard>
    );
  }

  const canReview =
    session?.status === "pending" && execution.status !== "success";
  const canUndo =
    Boolean(liveProposal?.checkpointId) &&
    (liveProposal?.status === "applied" ||
      liveProposal?.status === "apply_conflicted");

  const handleDecision = (action: "apply" | "reject" | "feedback") =>
    withBusy(action, async () => {
      const submitResult = submitContentEditReviewDecisionByExecution(
        {
          toolCallId: execution.toolCallId,
          rawInput: execution.input,
          timestamp: execution.timestamp,
        },
        {
          action,
          feedback: action === "feedback" ? feedbackText.trim() : undefined,
          submittedAt: Date.now(),
        },
      );
      if (submitResult === "missing") {
        message.error("当前审阅会话已失效，请重新发起修改。");
        return;
      }
      if (action === "feedback") {
        setFeedbackOpen(false);
        setFeedbackText("");
        message.success("修改意见已提交，AI 将基于这条意见继续调整。");
        return;
      }
      message.success(
        action === "apply" ? "已确认应用这次修改。" : "已拒绝这次修改。",
      );
    });

  const handleUndo = () =>
    withBusy("undo", async () => {
      if (!liveProposal?.checkpointId) {
        message.error("当前没有可恢复的修改记录");
        return;
      }
      const result = await restoreContentCheckpoint({
        checkpointId: liveProposal.checkpointId,
      });
      if (!result.success) {
        if (result.errorCode === "RESTORE_CONFLICT") {
          modal.confirm({
            title: "恢复会覆盖后续编辑",
            content: result.message,
            okText: "继续恢复",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
              await restoreContentCheckpoint({
                checkpointId: liveProposal.checkpointId!,
                force: true,
              });
            },
          });
          return;
        }
        message.error(result.message || "恢复失败");
        return;
      }
      message.success("已恢复到本次 AI 修改前。");
    });

  const title = canReview
    ? "请确认这次修改"
    : outputResult?.message || "内容修改结果";

  return (
    <ToolCard isDark={isDark}>
      <ToolCardHeader isDark={isDark} divided>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div
              className={`text-base font-semibold ${
                isDark ? "text-slate-100" : "text-slate-900"
              }`}
            >
              {title}
            </div>
            <ToolMutedText isDark={isDark} className="mt-2 break-words">
              这里展示的是修改后的完整内容。只有你确认之后，才会真正写入正文。
            </ToolMutedText>
            <div className="mt-3 flex flex-wrap gap-2">
              <ToolBadge isDark={isDark}>
                {sourceLabelMap[proposal.sourceToolName] || "内容改写"}
              </ToolBadge>
            </div>
          </div>
          {canReview ? (
            <div className="flex flex-wrap gap-2 lg:max-w-[320px] lg:justify-end">
              <PrimaryButton
                onClick={() => void handleDecision("apply")}
                disabled={busyAction.length > 0}
              >
                确认应用
              </PrimaryButton>
              <SecondaryButton
                onClick={() => setFeedbackOpen((prev) => !prev)}
                disabled={busyAction.length > 0}
              >
                提修改意见
              </SecondaryButton>
              <PrimaryButton
                onClick={() => void handleDecision("reject")}
                disabled={busyAction.length > 0}
                tone="rose"
              >
                拒绝
              </PrimaryButton>
            </div>
          ) : null}
        </div>
        {outputResult && !canReview ? (
          <div
            className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
              outputResult.action === "applied"
                ? isDark
                  ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
                : outputResult.action === "feedback"
                  ? isDark
                    ? "border-amber-400/20 bg-amber-500/10 text-amber-200"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                  : isDark
                    ? "border-slate-400/20 bg-slate-500/10 text-slate-200"
                    : "border-slate-200 bg-slate-50 text-slate-700"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {actionLabelMap[outputResult.action] || "已处理"}
              </span>
              <span>{outputResult.message}</span>
            </div>
            {outputResult.feedback ? (
              <div className="mt-2 break-words">
                已记录的修改意见：{outputResult.feedback}
              </div>
            ) : null}
          </div>
        ) : null}
        {liveProposal?.lastError ? (
          <ToolMutedText isDark={isDark} className="mt-2 text-rose-500">
            {liveProposal.lastError}
          </ToolMutedText>
        ) : null}
      </ToolCardHeader>

      <ToolCardBody>
        {/* 改动摘要 */}
        <CompactSummary
          patchCount={proposal.diffSummary.patchCount}
          insertedChars={proposal.diffSummary.insertedChars}
          deletedChars={proposal.diffSummary.deletedChars}
          isDark={isDark}
          expanded={expandedPreview}
          onToggle={() => setExpandedPreview((prev) => !prev)}
        />

        {/* 改动预览卡片（折叠展开） */}
        {expandedPreview && changePreviews.length > 0 && (
          <div className="space-y-2">
            {changePreviews.map((preview) => (
              <ChangePreviewCard
                key={preview.operationId}
                preview={preview}
                isDark={isDark}
              />
            ))}
          </div>
        )}

        {/* 内容预览区域 + Tab 切换 */}
        {proposal.proposedMarkdown ? (
          <SectionShell
            isDark={isDark}
            title={
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowDiffView(true)}
                  className={`text-sm font-medium transition ${
                    showDiffView
                      ? isDark
                        ? "text-slate-100"
                        : "text-slate-900"
                      : isDark
                        ? "text-slate-500 hover:text-slate-300"
                        : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  改动高亮
                </button>
                <button
                  onClick={() => setShowDiffView(false)}
                  className={`text-sm font-medium transition ${
                    !showDiffView
                      ? isDark
                        ? "text-slate-100"
                        : "text-slate-900"
                      : isDark
                        ? "text-slate-500 hover:text-slate-300"
                        : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  完整内容
                </button>
              </div>
            }
          >
            <div
              className={`max-h-[420px] overflow-y-auto rounded-2xl border p-3 ${
                isDark
                  ? "border-white/10 bg-slate-950/70"
                  : "border-slate-200 bg-white"
              }`}
            >
              {showDiffView && mergedReviewContent ? (
                <DiffHighlightedEditor
                  content={mergedReviewContent}
                  isDark={isDark}
                  extensions={dynamicExtensions}
                />
              ) : (
                <Editor
                  initValue={previewContent}
                  readonly
                  extensions={dynamicExtensions}
                  className={isDark ? "text-slate-100" : "text-slate-900"}
                  style={{ padding: "0 4px" }}
                />
              )}
            </div>
          </SectionShell>
        ) : null}

        {canReview && feedbackOpen ? (
          <SectionShell isDark={isDark} title="告诉 AI 你想怎么改">
            <div className="space-y-3">
              <FeedbackTemplates
                isDark={isDark}
                onSelect={(template) =>
                  setFeedbackText((prev) =>
                    prev ? `${prev}；${template}` : template,
                  )
                }
              />
              <textarea
                value={feedbackText}
                onChange={(event) => setFeedbackText(event.target.value)}
                placeholder="例如：语气更自然一些；第二段保留原意但更精炼；不要改标题。"
                rows={4}
                className={`w-full resize-y rounded-2xl border px-4 py-3 text-sm outline-none transition ${
                  isDark
                    ? "border-white/10 bg-slate-950/70 text-slate-100 placeholder:text-slate-500 focus:border-sky-400/60"
                    : "border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:border-sky-500"
                }`}
              />
              <div className="flex flex-wrap gap-2">
                <PrimaryButton
                  onClick={() => void handleDecision("feedback")}
                  disabled={!feedbackText.trim() || busyAction.length > 0}
                >
                  提交修改意见
                </PrimaryButton>
                <SecondaryButton
                  onClick={() => {
                    setFeedbackOpen(false);
                    setFeedbackText("");
                  }}
                  disabled={busyAction.length > 0}
                >
                  取消
                </SecondaryButton>
              </div>
            </div>
          </SectionShell>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {canUndo ? (
            <SecondaryButton
              onClick={() => void handleUndo()}
              disabled={busyAction.length > 0}
            >
              撤销这次应用
            </SecondaryButton>
          ) : null}
        </div>
      </ToolCardBody>
    </ToolCard>
  );
};

export default ContentEditProposalRenderer;
