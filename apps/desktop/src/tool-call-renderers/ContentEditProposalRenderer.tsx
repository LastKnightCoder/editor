import { useEffect, useMemo, useRef, useState } from "react";
import { getContentKit } from "@/services/editorKit";
import type React from "react";
import { CircleCheck, CircleX, MessageSquareText, type LucideIcon } from "lucide-react";
import { Button, ConfirmDialog, Segmented, Textarea, cn, toast } from "@tau/ui";
import type { ToolCallCustomRendererProps } from "./types";
import { ToolBadge, ToolCard, ToolCardBody, ToolCardHeader, ToolMutedText } from "@tau/chat-ui";
import { Editor } from "@tau/editor";
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
import { DiffHighlightedEditor } from "./DiffHighlightedEditor";
import { CompactSummary, ChangePreviewCard, FeedbackTemplates } from "./change-preview-components";
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

const actionLabelMap: Record<string, string> = {
  applied: "已应用",
  rejected: "已拒绝",
  feedback: "已提交修改意见",
};

/** 完成态结果：小图标 + 语义色（不用彩色实底徽章） */
const resultToneMap: Record<string, { Icon: LucideIcon; className: string }> = {
  applied: { Icon: CircleCheck, className: "text-ok" },
  feedback: { Icon: MessageSquareText, className: "text-warn" },
  rejected: { Icon: CircleX, className: "text-ink-3" },
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
  execution: ToolCallCustomRendererProps["execution"]
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
    (payload.kind === "content-edit-review-result" || payload.type === "content-edit-review-result")
  ) {
    return payload;
  }

  return null;
};

/** 卡内分组：小标题行 + 内容，区块之间靠留白分组（零横线） */
const SectionShell = ({
  title,
  children,
}: {
  title: string | React.ReactNode;
  children: React.ReactNode;
}) => (
  <div className="space-y-2">
    <div className="text-tau-body text-ink-1 flex min-h-[26px] items-center font-medium">
      {title}
    </div>
    {children}
  </div>
);

type PreviewMode = "diff" | "full";

const ContentEditProposalRenderer = ({ execution, isDark }: ToolCallCustomRendererProps) => {
  const [busyAction, setBusyAction] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [showDiffView, setShowDiffView] = useState(true);
  const [expandedPreview, setExpandedPreview] = useState(false);
  const [restoreConflict, setRestoreConflict] = useState<{
    checkpointId: string;
    message?: string;
  } | null>(null);
  const feedbackSectionRef = useRef<HTMLDivElement | null>(null);
  const feedbackTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const outputResult = getMetadataResult(execution) || parseOutputResult(execution.output);

  const session = useContentEditReviewSessionStore(state =>
    state.findRecordByExecution({
      toolCallId: execution.toolCallId,
      rawInput: execution.input,
      timestamp: execution.timestamp,
    })
  );
  const proposalId = session?.proposalId || outputResult?.proposalId;
  const conversationKey = session?.conversationKey || outputResult?.conversationKey;

  const liveProposal = useContentEditReviewStore(state =>
    proposalId ? state.proposals[proposalId] : undefined
  );
  const currentPermission = useContentEditReviewStore(state =>
    conversationKey ? state.permissions[conversationKey] : undefined
  );

  const proposal = useMemo(() => {
    if (session) {
      const merged = {
        ...session.payload,
        ...liveProposal,
        currentPermission: currentPermission || session.payload.currentPermission,
      };
      return merged as ContentEditRendererPayload & Partial<ContentEditProposalRecord>;
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
      beforeMarkdown: liveProposal?.beforeMarkdown,
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
    return merged as ContentEditRendererPayload & Partial<ContentEditProposalRecord>;
  }, [conversationKey, currentPermission, liveProposal, outputResult, proposalId, session]);

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
        options: {
          collapseUnchanged: true,
          contextRadius: 1,
        },
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

  useEffect(() => {
    if (!feedbackOpen) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      feedbackSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
      feedbackTextareaRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [feedbackOpen]);

  if (!proposal) {
    if (outputResult) {
      return (
        <ToolCard isDark={isDark}>
          <ToolCardHeader isDark={isDark}>
            <div className="flex items-center gap-2">
              <div className="text-tau-body text-ink-1 min-w-0 flex-1 font-medium">
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
          ) : (
            <div className="pb-2" />
          )}
        </ToolCard>
      );
    }

    return (
      <ToolCard isDark={isDark}>
        <ToolCardHeader isDark={isDark}>
          <div className="text-tau-body text-ink-1 font-medium">内容修改处理中</div>
          <ToolMutedText isDark={isDark} className="mb-2 mt-1">
            正在准备审阅结果，请稍候。
          </ToolMutedText>
        </ToolCardHeader>
      </ToolCard>
    );
  }

  const canReview = session?.status === "pending" && execution.status !== "success";
  const canUndo =
    Boolean(liveProposal?.checkpointId) &&
    (liveProposal?.status === "applied" || liveProposal?.status === "apply_conflicted");
  const busy = busyAction.length > 0;

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
        }
      );
      if (submitResult === "missing") {
        toast.error("当前审阅会话已失效，请重新发起修改。");
        return;
      }
      if (action === "feedback") {
        setFeedbackOpen(false);
        setFeedbackText("");
        toast.success("修改意见已提交，AI 将基于这条意见继续调整。");
        return;
      }
      toast.success(action === "apply" ? "已确认应用这次修改。" : "已拒绝这次修改。");
    });

  const handleUndo = () =>
    withBusy("undo", async () => {
      if (!liveProposal?.checkpointId) {
        toast.error("当前没有可恢复的修改记录");
        return;
      }
      const result = await restoreContentCheckpoint({
        checkpointId: liveProposal.checkpointId,
      });
      if (!result.success) {
        if (result.errorCode === "RESTORE_CONFLICT") {
          setRestoreConflict({ checkpointId: liveProposal.checkpointId, message: result.message });
          return;
        }
        toast.error(result.message || "恢复失败");
        return;
      }
      toast.success("已恢复到本次 AI 修改前。");
    });

  const handleForceRestore = async () => {
    if (!restoreConflict) return;
    await restoreContentCheckpoint({
      checkpointId: restoreConflict.checkpointId,
      force: true,
    });
  };

  const title = canReview ? "请确认这次修改" : outputResult?.message || "内容修改结果";
  const resultTone = resultToneMap[outputResult?.action || ""] || resultToneMap.rejected;
  const ResultIcon = resultTone.Icon;

  return (
    <ToolCard isDark={isDark}>
      <ToolCardHeader isDark={isDark}>
        <div className="space-y-3">
          <div className="text-tau-title text-ink-1 font-semibold">{title}</div>
          {canReview ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleDecision("apply")}
                disabled={busy}
                loading={busyAction === "apply"}
              >
                确认应用
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setFeedbackOpen(prev => !prev)}
                disabled={busy}
              >
                提修改意见
              </Button>
              <Button
                variant="danger-soft"
                size="sm"
                onClick={() => void handleDecision("reject")}
                disabled={busy}
                loading={busyAction === "reject"}
              >
                拒绝
              </Button>
            </div>
          ) : (
            <div className="bg-hover rounded-tau-sm flex items-start gap-2.5 px-3 py-2.5">
              <ResultIcon
                size={15}
                strokeWidth={1.75}
                className={cn("mt-[2px] shrink-0", resultTone.className)}
              />
              <div className="min-w-0 space-y-0.5">
                <div className="text-tau-body text-ink-1 font-medium">
                  {actionLabelMap[outputResult?.action || ""] || "已处理"}
                </div>
                <div className="text-tau-meta text-ink-2 break-words leading-[1.6]">
                  {outputResult?.message || title}
                </div>
              </div>
            </div>
          )}
        </div>
        {liveProposal?.lastError ? (
          <ToolMutedText isDark={isDark} className="text-danger mt-2">
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
          onToggle={() => setExpandedPreview(prev => !prev)}
          canUndo={canUndo}
          undoDisabled={busy}
          onUndo={() => void handleUndo()}
        />

        {/* 改动预览卡片（折叠展开） */}
        {expandedPreview && changePreviews.length > 0 && (
          <div className="space-y-2">
            {changePreviews.map(preview => (
              <ChangePreviewCard key={preview.operationId} preview={preview} isDark={isDark} />
            ))}
          </div>
        )}

        {/* 内容预览区域 + 视图切换 */}
        {proposal.proposedMarkdown ? (
          <SectionShell
            title={
              <Segmented<PreviewMode>
                label="预览视图"
                size="sm"
                value={showDiffView ? "diff" : "full"}
                onValueChange={value => setShowDiffView(value === "diff")}
              >
                <Segmented.Item value="diff" label="改动高亮" />
                <Segmented.Item value="full" label="完整内容" />
              </Segmented>
            }
          >
            <div className="border-line-1 bg-surface rounded-tau-sm max-h-[420px] overflow-y-auto border px-3 py-2.5">
              {showDiffView && mergedReviewContent ? (
                <DiffHighlightedEditor content={mergedReviewContent} isDark={isDark} />
              ) : (
                <Editor
                  kit={getContentKit()}
                  initValue={previewContent}
                  readonly
                  className="text-ink-1"
                  style={{ padding: "0 4px" }}
                />
              )}
            </div>
          </SectionShell>
        ) : null}

        {canReview && feedbackOpen ? (
          <div ref={feedbackSectionRef}>
            <SectionShell title="告诉 AI 你想怎么改">
              <div className="space-y-2.5">
                <FeedbackTemplates
                  isDark={isDark}
                  onSelect={template =>
                    setFeedbackText(prev => (prev ? `${prev}；${template}` : template))
                  }
                />
                <Textarea
                  ref={feedbackTextareaRef}
                  value={feedbackText}
                  onChange={event => setFeedbackText(event.target.value)}
                  placeholder="例如：语气更自然一些；第二段保留原意但更精炼；不要改标题。"
                  rows={4}
                  className="min-h-28 resize-y [field-sizing:content]"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void handleDecision("feedback")}
                    disabled={!feedbackText.trim() || busy}
                    loading={busyAction === "feedback"}
                  >
                    提交修改意见
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFeedbackOpen(false);
                      setFeedbackText("");
                    }}
                    disabled={busy}
                  >
                    取消
                  </Button>
                </div>
              </div>
            </SectionShell>
          </div>
        ) : null}
      </ToolCardBody>

      <ConfirmDialog
        open={restoreConflict !== null}
        onOpenChange={open => {
          if (!open) setRestoreConflict(null);
        }}
        title="恢复会覆盖后续编辑"
        description={restoreConflict?.message}
        confirmText="继续恢复"
        cancelText="取消"
        danger
        onConfirm={handleForceRestore}
      />
    </ToolCard>
  );
};

export default ContentEditProposalRenderer;
