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
import { SuggestionProposalCard } from "./SuggestionProposalCard";
import { measurePerf } from "@/utils/perf-trace";

import { useReviewToolI18n, reviewFeedback, reviewFailure } from "./review.i18n";

type ReviewResultPayload = {
  kind?: "content-edit-review-result";
  type: "content-edit-review-result";
  action: "applied" | "rejected" | "feedback" | "commit_pending";
  submittedAt: number;
  contentId: number;
  message: string;
  proposalId: string;
  conversationKey: string;
  checkpointId?: string;
  feedback?: string;
  /** 逐条建议的结果：有它即为逐条建议提案，条目状态以主进程记录为准 */
  items?: unknown[];
  proposal?: {
    sourceToolName: string;
    proposedMarkdown?: string;
    diffSummary: ContentEditRendererPayload["diffSummary"];
    patches: ContentEditRendererPayload["patches"];
  };
};

const actionLabel = (action: string | undefined, t: ReturnType<typeof useReviewToolI18n>["t"]) =>
  t(
    action === "applied"
      ? "review.action.applied"
      : action === "rejected"
        ? "review.action.rejected"
        : action === "feedback"
          ? "review.action.feedback"
          : "review.processed"
  );

/** 完成态结果：小图标 + 语义色（不用彩色实底徽章） */
const resultToneMap: Record<string, { Icon: LucideIcon; className: string }> = {
  applied: { Icon: CircleCheck, className: "text-ok" },
  feedback: { Icon: MessageSquareText, className: "text-warn" },
  rejected: { Icon: CircleX, className: "text-ink-3" },
};

type FailedEditResult = {
  success: false;
  errorCode?: string;
  message: string;
  details?: { expectedText?: string; actualText?: string };
};

const parseOutputResult = (output?: string): ReviewResultPayload | FailedEditResult | null => {
  if (!output) return null;
  try {
    const parsed = JSON.parse(output);
    if (parsed?.success === false && typeof parsed.message === "string") return parsed;
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
  const { t } = useReviewToolI18n();
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
  const output = useMemo(() => parseOutputResult(execution.output), [execution.output]);
  const failure = output && "success" in output ? output : null;
  const outputResult = getMetadataResult(execution) || (output && "type" in output ? output : null);

  const session = useContentEditReviewSessionStore(state =>
    state.findRecordByExecution({
      toolCallId: execution.toolCallId,
      rawInput: execution.input,
      timestamp: execution.timestamp,
    })
  );
  const proposalId = session?.proposalId || outputResult?.proposalId;

  const liveProposal = useContentEditReviewStore(state =>
    proposalId ? state.proposals[proposalId] : undefined
  );

  const proposal = useMemo(() => {
    if (session) {
      const merged = {
        ...session.payload,
        ...liveProposal,
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
      targetSource: liveProposal?.targetSource || "active-session",
      lastError: liveProposal?.lastError,
      createdAt: liveProposal?.createdAt || outputResult.submittedAt,
      updatedAt: liveProposal?.updatedAt || outputResult.submittedAt,
      proposedMarkdown: outputResult.proposal.proposedMarkdown,
    };
    return merged as ContentEditRendererPayload & Partial<ContentEditProposalRecord>;
  }, [liveProposal, outputResult, session]);

  const previewContent = useMemo(() => {
    if (!proposal?.proposedMarkdown) {
      return [];
    }
    return markdownToContent(proposal.proposedMarkdown);
  }, [proposal?.proposedMarkdown]);

  const mergedReviewContent = useMemo(() => {
    if (!proposal?.proposedMarkdown) return null;
    const proposedMarkdown = proposal.proposedMarkdown;
    const beforeMarkdown =
      proposal.beforeMarkdown ||
      (proposal.snapshotId ? getSnapshot(proposal.snapshotId)?.markdown : null);
    if (!beforeMarkdown) {
      return null;
    }

    try {
      return measurePerf(
        "review.merge",
        () =>
          buildMergedReviewContent({
            beforeMarkdown,
            afterMarkdown: proposedMarkdown,
            patches: proposal.patches,
            options: {
              collapseUnchanged: true,
              contextRadius: 1,
            },
          }).content,
        { contentId: proposal.contentId }
      );
    } catch (error) {
      console.warn("构建审阅 merged 内容失败:", error);
      return null;
    }
  }, [
    proposal?.patches,
    proposal?.proposedMarkdown,
    proposal?.snapshotId,
    proposal?.beforeMarkdown,
    proposal?.contentId,
  ]);

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

  if (failure) {
    const mismatch = failure.errorCode === "REPLACE_GUARD_MISMATCH";
    const details = failure.details;
    return (
      <ToolCard isDark={isDark}>
        <ToolCardHeader isDark={isDark}>
          <div className="text-tau-body text-ink-1 font-medium">
            {mismatch
              ? t("review.notExecuted")
              : failure.errorCode === "COMMIT_PENDING"
                ? t("review.commitPending")
                : t("review.result")}
          </div>
        </ToolCardHeader>
        <ToolCardBody>
          <ToolMutedText isDark={isDark} className="break-words">
            {mismatch ? t("review.mismatch") : failure.message}
          </ToolMutedText>
          {mismatch &&
          typeof details?.expectedText === "string" &&
          typeof details.actualText === "string" ? (
            <dl className="text-tau-body mt-2 grid max-h-48 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 overflow-auto">
              <dt className="text-ink-3">{t("review.expected")}</dt>
              <dd className="break-words whitespace-pre-wrap">
                {details.expectedText || t("review.emptyText")}
              </dd>
              <dt className="text-ink-3">{t("review.actual")}</dt>
              <dd className="break-words whitespace-pre-wrap">
                {details.actualText || t("review.emptyText")}
              </dd>
            </dl>
          ) : null}
        </ToolCardBody>
      </ToolCard>
    );
  }

  // 逐条建议：对话里是按条卡片，与正文右栏操作同一份主进程记录
  const suggestionContentId =
    liveProposal?.contentId ?? session?.payload.contentId ?? outputResult?.contentId;
  if (
    proposalId &&
    suggestionContentId &&
    (liveProposal?.suggestions || Array.isArray(outputResult?.items))
  )
    return (
      <SuggestionProposalCard
        proposalId={proposalId}
        contentId={suggestionContentId}
        databaseName={liveProposal?.databaseName}
        isDark={isDark}
        waiting={session?.status === "pending" && execution.status !== "success"}
      />
    );

  if (!proposal) {
    if (outputResult) {
      return (
        <ToolCard isDark={isDark}>
          <ToolCardHeader isDark={isDark}>
            <div className="flex items-center gap-2">
              <div className="text-tau-body text-ink-1 min-w-0 flex-1 font-medium">
                {actionLabel(outputResult.action, t)}
              </div>
              <ToolBadge isDark={isDark}>{outputResult.message}</ToolBadge>
            </div>
          </ToolCardHeader>
          {outputResult.feedback ? (
            <ToolCardBody>
              <ToolMutedText isDark={isDark} className="break-words">
                {t("review.recordedFeedback", { feedback: outputResult.feedback })}
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
          <div className="text-tau-body text-ink-1 font-medium">{t("review.preparing")}</div>
          <ToolMutedText isDark={isDark} className="mt-1 mb-2">
            {t("review.preparingHint")}
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
        toast.error(reviewFeedback("review.sessionExpired"));
        return;
      }
      if (action === "feedback") {
        setFeedbackOpen(false);
        setFeedbackText("");
        toast.success(reviewFeedback("review.feedbackSubmitted"));
        return;
      }
      toast.success(
        reviewFeedback(action === "apply" ? "review.appliedFeedback" : "review.rejectedFeedback")
      );
    });

  const handleUndo = () =>
    withBusy("undo", async () => {
      if (!liveProposal?.checkpointId) {
        toast.error(reviewFeedback("review.noRestore"));
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
        toast.error(reviewFailure("review.restoreFailed", result.message || undefined));
        return;
      }
      toast.success(reviewFeedback("review.restored"));
    });

  const handleForceRestore = async () => {
    if (!restoreConflict) return;
    await restoreContentCheckpoint({
      checkpointId: restoreConflict.checkpointId,
      force: true,
    });
  };

  const title = canReview
    ? t("review.confirmTitle")
    : outputResult?.message || t("review.contentResult");
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
                {t("review.apply")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setFeedbackOpen(prev => !prev)}
                disabled={busy}
              >
                {t("review.provideFeedback")}
              </Button>
              <Button
                variant="danger-soft"
                size="sm"
                onClick={() => void handleDecision("reject")}
                disabled={busy}
                loading={busyAction === "reject"}
              >
                {t("review.reject")}
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
                  {actionLabel(outputResult?.action, t)}
                </div>
                <div className="text-tau-meta text-ink-2 leading-[1.6] break-words">
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
                label={t("review.view")}
                size="sm"
                value={showDiffView ? "diff" : "full"}
                onValueChange={value => setShowDiffView(value === "diff")}
              >
                <Segmented.Item value="diff" label={t("review.diff")} />
                <Segmented.Item value="full" label={t("review.full")} />
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
            <SectionShell title={t("review.feedbackTitle")}>
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
                  placeholder={t("review.feedbackExample")}
                  rows={4}
                  className="[field-sizing:content] min-h-28 resize-y"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void handleDecision("feedback")}
                    disabled={!feedbackText.trim() || busy}
                    loading={busyAction === "feedback"}
                  >
                    {t("review.submitFeedback")}
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
                    {t("review.cancel")}
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
        title={t("review.restoreTitle")}
        description={restoreConflict?.message}
        confirmText={t("review.continueRestore")}
        cancelText={t("review.cancel")}
        danger
        onConfirm={handleForceRestore}
      />
    </ToolCard>
  );
};

export default ContentEditProposalRenderer;
