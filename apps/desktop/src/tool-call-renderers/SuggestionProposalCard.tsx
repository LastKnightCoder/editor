import { useReviewToolI18n, type ReviewToolTranslate } from "./review.i18n";
/**
 * 对话里的修改卡：Agent 在某篇正文留下的一组改动，不打开文章也能逐条接受、退回、回复。
 * 每处一行直接显示差异；多处全部处理完后收起成一行摘要，可展开回看或整体撤销。
 */

import { useState } from "react";
import { CheckCheck, ChevronDown, FileText, Undo2 } from "lucide-react";
import { Button, cn } from "@tau/ui";
import { ToolCard, ToolCardHeader, ToolMutedText } from "@tau/chat-ui";
import { AgentAvatar, AgentName } from "@/components/AgentIdentity/AgentAvatar";
import {
  SuggestionCard,
  agentNameOf,
  isApplying,
  needsReview,
  useSuggestionActions,
} from "@/components/ContentReview";
import {
  openSuggestionTarget,
  targetLabel,
  useSuggestionTarget,
} from "@/components/ContentReview/target";
import { useProposalSuggestions } from "@/services/content-editing/suggestion-queries";
import useSettingStore from "@/stores/useSettingStore";
import { formatAgo } from "@/utils/formatAgo";
import type { ContentSuggestion } from "@/types/content-suggestion";

const summaryOf = (items: ContentSuggestion[], direct: boolean, t: ReviewToolTranslate) => {
  const count = (status: ContentSuggestion["status"]) =>
    items.filter(item => item.status === status).length;
  return [
    count("accepted") &&
      t(direct ? "review.summary.applied" : "review.summary.accepted", {
        count: count("accepted"),
      }),
    count("answered") && t("review.summary.answered", { count: count("answered") }),
    count("rejected") && t("review.summary.rejected", { count: count("rejected") }),
    count("expired") && t("review.summary.expired", { count: count("expired") }),
    count("undone") && t("review.summary.undone", { count: count("undone") }),
    count("superseded") && t("review.summary.superseded", { count: count("superseded") }),
  ]
    .filter(Boolean)
    .join(" · ");
};

const verbOf = (
  items: ContentSuggestion[],
  direct: boolean,
  finished: boolean,
  t: ReviewToolTranslate
) => {
  const edits = items.filter(item => item.kind === "edit").length;
  const questions = items.length - edits;
  if (finished) return direct ? t("review.verb.direct") : t("review.verb.finished");
  return [
    questions && t("review.verb.questions", { count: questions }),
    edits && t("review.verb.edits", { count: edits }),
  ]
    .filter(Boolean)
    .join(t("review.verb.join"));
};

export function SuggestionProposalCard({
  proposalId,
  contentId,
  databaseName,
  isDark,
  waiting,
}: {
  proposalId: string;
  contentId: number;
  databaseName?: string;
  isDark: boolean;
  /** 发起它的工具调用还在等逐条结果 */
  waiting: boolean;
}) {
  const { t, locale } = useReviewToolI18n();
  const active = useSettingStore(state => state.setting.database.active);
  const database = databaseName ?? active;
  const { data: items } = useProposalSuggestions(proposalId, database);
  const { data: target } = useSuggestionTarget(contentId, database);
  const actions = useSuggestionActions(database);
  const [expanded, setExpanded] = useState(false);

  if (!items?.length)
    return (
      <ToolCard isDark={isDark}>
        <ToolCardHeader isDark={isDark}>
          <div className="text-tau-body text-ink-1 font-medium">{t("review.modify")}</div>
          <ToolMutedText isDark={isDark} className="mt-1 mb-2">
            {items ? t("review.cleared") : t("review.reading")}
          </ToolMutedText>
        </ToolCardHeader>
      </ToolCard>
    );

  const agent = agentNameOf(items[0]);
  const open = items.filter(item => needsReview(item) || isApplying(item));
  const pendingEdits = items.filter(item => item.status === "pending" && item.kind === "edit");
  const pendingQuestions = items.filter(
    item => item.status === "pending" && item.kind === "question"
  );
  const accepted = items.filter(item => item.status === "accepted" && item.applied);
  const direct = items.some(item => item.mode === "direct");
  const finished = open.length === 0;
  const collapsible = finished && items.length > 1;
  const handled = items.length - open.length;
  const showList = !collapsible || expanded;

  return (
    <ToolCard isDark={isDark}>
      <div
        className={cn(
          "text-tau-body flex items-center gap-1.5 px-3 py-2.5",
          collapsible && "hover:bg-hover cursor-pointer"
        )}
        onClick={collapsible ? () => setExpanded(value => !value) : undefined}
      >
        <AgentAvatar name={agent} size={20} status={!finished ? "waiting" : undefined} />
        <AgentName name={agent} />
        <span className="text-ink-2 shrink-0">{verbOf(items, direct, finished, t)}</span>
        <button
          type="button"
          className="text-accent-text inline-flex min-w-0 cursor-pointer items-center gap-1 hover:underline"
          onClick={event => {
            event.stopPropagation();
            openSuggestionTarget(target);
          }}
        >
          <FileText size={13} strokeWidth={1.75} className="shrink-0" />
          <span className="truncate">{targetLabel(target)}</span>
        </button>
        <span className="flex-1" />
        {finished ? (
          <>
            {collapsible ? (
              <span className="text-tau-meta text-ink-3 shrink-0">
                {summaryOf(items, direct, t)}
              </span>
            ) : null}
            {accepted.length > 1 ? (
              <Button
                variant="ghost"
                size="sm"
                icon={Undo2}
                className="-my-1"
                disabled={actions.busy}
                loading={accepted.some(item => actions.busyOn(item) === "undo")}
                onClick={event => {
                  event.stopPropagation();
                  void actions.undo(accepted);
                }}
              >
                {t("review.undoAll")}
              </Button>
            ) : null}
            {collapsible ? (
              <ChevronDown
                aria-hidden
                size={14}
                className={cn("text-ink-3 shrink-0 transition-transform", expanded && "rotate-180")}
              />
            ) : (
              <span className="text-tau-micro text-ink-3 shrink-0 tabular-nums">
                {formatAgo(items[0].createdAt, locale)}
              </span>
            )}
          </>
        ) : handled ? (
          <span className="text-tau-meta text-ink-3 flex shrink-0 items-center gap-1.5 tabular-nums">
            <span className="bg-line-1 h-[3px] w-12 overflow-hidden rounded-full">
              <span
                className="bg-ok block h-full rounded-full"
                style={{ width: `${(handled / items.length) * 100}%` }}
              />
            </span>
            {handled}/{items.length}
          </span>
        ) : (
          <span className="text-tau-micro text-ink-3 shrink-0 tabular-nums">
            {formatAgo(items[0].createdAt, locale)}
          </span>
        )}
      </div>

      {showList ? (
        <ul className="border-line-2 border-t">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="border-line-2 hover:bg-surface-hover border-b px-3 py-2 last:border-b-0"
            >
              <SuggestionCard
                item={item}
                index={items.length > 1 ? index + 1 : undefined}
                actions={actions}
                onLocate={target ? () => openSuggestionTarget(target, item.id) : undefined}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {!finished ? (
        <div className="border-line-2 flex flex-wrap items-center gap-1.5 border-t px-3 py-2">
          <span className="text-tau-meta text-ink-3 min-w-0 flex-1">
            {pendingQuestions.length
              ? t("review.answerFirst", { agent })
              : waiting
                ? t("review.continueAgent", { agent })
                : t("review.pending", { count: open.length })}
          </span>
          {pendingEdits.length > 1 ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={actions.busy}
              onClick={() => void actions.reject(pendingEdits)}
            >
              {t("review.rejectAll")}
            </Button>
          ) : null}
          {pendingEdits.length ? (
            <Button
              variant="primary"
              size="sm"
              icon={CheckCheck}
              disabled={actions.busy}
              loading={pendingEdits.some(item => actions.busyOn(item) === "accept")}
              onClick={() => void actions.accept(pendingEdits)}
            >
              {handled
                ? t("review.acceptRemaining", { count: pendingEdits.length })
                : pendingEdits.length > 1
                  ? t("review.acceptAll")
                  : t("review.accept")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </ToolCard>
  );
}
