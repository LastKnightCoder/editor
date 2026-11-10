/**
 * 一条建议的行：前后文 + 词级差异 + 一句理由，处理按钮收成悬停图标。
 * 提问在行内给出选项按钮；处理过的行原地去色并换成状态胶囊。
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  CircleAlert,
  Crosshair,
  LoaderCircle,
  MessageCircle,
  Pencil,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button, Textarea, Tooltip, cn } from "@tau/ui";
import { agentColorStyle } from "@/services/agent-identity";
import type { ContentSuggestion } from "@/types/content-suggestion";
import { agentNameOf, clipHead, clipTail, clipText, splitTextChange } from "./model";
import { focusSuggestionInDocument, useSuggestionFocus, type SuggestionActions } from "./actions";

const CONTEXT_CHARS = 24;

/** 前后文 + 删掉的（红色删除线）+ 新写的（绿色下划线）；待处理时再铺浅底，处理过后只去底色 */
export function SuggestionDiff({ item, muted }: { item: ContentSuggestion; muted?: boolean }) {
  const { prefix, removed, added, suffix } = splitTextChange(item.beforeText, item.afterText);
  return (
    <div className="text-ink-1 max-h-48 overflow-y-auto leading-[1.75] break-words whitespace-pre-wrap">
      {prefix ? <span>{clipHead(prefix, CONTEXT_CHARS)}</span> : null}
      {removed ? (
        <span
          className={cn(
            "text-danger decoration-danger rounded-[3px] px-0.5 line-through decoration-[1.5px]",
            !muted && "bg-danger-soft"
          )}
        >
          {removed}
        </span>
      ) : null}
      {added ? (
        <span
          className={cn(
            "text-ok decoration-ok rounded-[3px] px-0.5 font-medium underline decoration-[1.5px] underline-offset-[3px]",
            !muted && "bg-ok-soft"
          )}
        >
          {added}
        </span>
      ) : null}
      {suffix ? <span>{clipTail(suffix, CONTEXT_CHARS)}</span> : null}
    </div>
  );
}

function ReplyBox({
  placeholder,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  submitLabel: string;
  busy: boolean;
  onSubmit(text: string): void;
  onCancel(): void;
}) {
  const [text, setText] = useState("");
  const submit = () => {
    if (!busy && text.trim()) onSubmit(text.trim());
  };
  return (
    <div
      className="border-line-1 bg-surface rounded-tau-sm mt-2 cursor-auto border p-2"
      onClick={event => event.stopPropagation()}
    >
      <Textarea
        autoFocus
        value={text}
        onChange={event => setText(event.target.value)}
        placeholder={placeholder}
        rows={2}
        className="[field-sizing:content] min-h-12 resize-none border-0 p-0 shadow-none focus:ring-0"
        onKeyDown={event => {
          if (
            !event.nativeEvent.isComposing &&
            event.key === "Enter" &&
            (event.metaKey || event.ctrlKey)
          ) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="text-tau-micro text-ink-3">⌘↵ 发送</span>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          取消
        </Button>
        <Button variant="soft" size="sm" disabled={!text.trim()} loading={busy} onClick={submit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

function RowAction({
  icon: Icon,
  label,
  tone,
  busy,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  tone?: "ok" | "danger";
  busy?: boolean;
  disabled?: boolean;
  onClick(): void;
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={event => {
          event.stopPropagation();
          onClick();
        }}
        className={cn(
          "rounded-tau-sm text-ink-3 grid size-6 cursor-pointer place-items-center",
          "ease-tau-out transition-[background,color] duration-[160ms] disabled:cursor-default disabled:opacity-35",
          tone === "ok"
            ? "enabled:hover:bg-ok-soft enabled:hover:text-ok"
            : tone === "danger"
              ? "enabled:hover:bg-danger-soft enabled:hover:text-danger"
              : "enabled:hover:bg-hover enabled:hover:text-ink-1"
        )}
      >
        {busy ? (
          <LoaderCircle size={14} strokeWidth={1.75} className="animate-spin" />
        ) : (
          <Icon size={14} strokeWidth={1.75} />
        )}
      </button>
    </Tooltip>
  );
}

const PILL = {
  accepted: { tone: "text-ok", icon: Check },
  answered: { tone: "text-ok", icon: Check },
  rejected: { tone: "text-ink-3", icon: X },
  undone: { tone: "text-ink-3", icon: Undo2 },
  superseded: { tone: "text-ink-3", icon: null },
  expired: { tone: "text-warn", icon: CircleAlert },
  applying: { tone: "text-ink-3", icon: LoaderCircle },
  pending: { tone: "text-accent-text", icon: null },
} satisfies Record<ContentSuggestion["status"], { tone: string; icon: LucideIcon | null }>;

const pillLabel = (item: ContentSuggestion) =>
  ({
    pending: "待处理",
    applying: "提交中",
    accepted: item.mode === "direct" ? "已落地" : "已接受",
    undone: "已撤销",
    rejected: item.kind === "question" ? "已跳过" : "已退回",
    expired: "已过期",
    superseded: "已替换",
    answered: "已回答",
  })[item.status];

function StatusPill({ item }: { item: ContentSuggestion }) {
  const { tone, icon: Icon } = PILL[item.status];
  return (
    <span
      className={cn(
        "border-line-1 text-tau-micro inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-1.5 whitespace-nowrap",
        tone
      )}
    >
      {Icon ? (
        <Icon
          size={11}
          strokeWidth={2}
          className={item.status === "applying" ? "animate-spin" : undefined}
        />
      ) : null}
      {pillLabel(item)}
    </span>
  );
}

/** 差异下方带标签的一段说明：Agent 的改动理由、你退回时的意见 */
function NoteLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="text-tau-meta mt-1.5 leading-[1.65] break-words">
      <span className="text-ink-3 mr-1.5">{label}</span>
      <span className="text-ink-2">{children}</span>
    </div>
  );
}

/** 状态行里的文字按钮 */
function InlineLink({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={event => {
        event.stopPropagation();
        onClick();
      }}
      className="text-accent-text inline-flex shrink-0 cursor-pointer items-center gap-1 hover:underline disabled:cursor-default disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function QuestionBody({ item, actions }: { item: ContentSuggestion; actions: SuggestionActions }) {
  const [writing, setWriting] = useState(false);
  const busy = actions.busyOn(item) === "answer";
  return (
    <>
      {item.beforeText ? (
        <div className="text-ink-3 border-line-1 mb-1 border-l-2 pl-2 break-words">
          {clipText(item.beforeText, 120)}
        </div>
      ) : null}
      <div className="text-ink-1 leading-[1.75] break-words">{item.reason}</div>
      {item.status === "answered" ? (
        <div className="text-tau-meta text-ink-3 mt-1 break-words">回答：{item.feedback}</div>
      ) : item.status === "pending" ? (
        writing ? (
          <ReplyBox
            placeholder="写下你的回答…"
            submitLabel="回答"
            busy={busy}
            onSubmit={text => void actions.answer(item, text)}
            onCancel={() => setWriting(false)}
          />
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(item.options ?? []).map(option => (
              <Button
                key={option}
                variant="secondary"
                size="sm"
                disabled={actions.busy}
                onClick={() => void actions.answer(item, option)}
              >
                {option}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              disabled={actions.busy}
              onClick={() => setWriting(true)}
            >
              我自己写
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={actions.busy}
              onClick={() => void actions.reject([item])}
            >
              跳过
            </Button>
          </div>
        )
      ) : null}
    </>
  );
}

type Composer = "reply" | "continue" | null;

function EditBody({
  item,
  actions,
  composer,
  setComposer,
  onLocate,
}: {
  item: ContentSuggestion;
  actions: SuggestionActions;
  composer: Composer;
  setComposer(next: Composer): void;
  onLocate?: () => void;
}) {
  const busyOn = actions.busyOn(item);
  const muted = item.status !== "pending" && item.status !== "applying";
  const canLocate =
    item.status === "pending" || item.status === "applying"
      ? item.edit.kind === "text" || item.edit.expected.length > 0
      : item.status === "accepted" && Boolean(item.applied?.expected.length);
  const statusNote =
    item.status === "expired"
      ? (item.error ?? "原文在别处被改过")
      : item.status === "applying"
        ? (item.error ?? "提交中…")
        : undefined;
  const showLocate = Boolean(onLocate && canLocate);
  return (
    <>
      <SuggestionDiff item={item} muted={muted} />
      {item.reason && item.status !== "expired" ? (
        <NoteLine label="改动说明">{item.reason}</NoteLine>
      ) : null}
      {item.status === "rejected" && item.feedback ? (
        <NoteLine label="你的意见">{item.feedback}</NoteLine>
      ) : null}
      {item.status !== "pending" || showLocate ? (
        <div className="text-tau-meta text-ink-3 mt-1.5 flex items-center gap-2.5">
          {item.status !== "pending" ? <StatusPill item={item} /> : null}
          {statusNote ? (
            <span className={cn("min-w-0 truncate", item.status === "expired" && "text-warn")}>
              {statusNote}
            </span>
          ) : null}
          {item.status === "expired" ? (
            <>
              <InlineLink disabled={actions.busy} onClick={() => void actions.rewrite(item)}>
                让它按新原文重写
              </InlineLink>
              <InlineLink disabled={actions.busy} onClick={() => void actions.reject([item])}>
                忽略
              </InlineLink>
            </>
          ) : null}
          {item.status === "applying" ? (
            <InlineLink disabled={actions.busy} onClick={() => void actions.accept([item])}>
              确认或恢复提交
            </InlineLink>
          ) : null}
          {showLocate ? (
            <button
              type="button"
              onClick={event => {
                event.stopPropagation();
                onLocate?.();
              }}
              className="hover:text-ink-1 ml-auto inline-flex shrink-0 cursor-pointer items-center gap-1"
            >
              <Crosshair size={11} strokeWidth={1.75} />
              在正文定位
            </button>
          ) : null}
        </div>
      ) : null}
      {composer === "reply" ? (
        <ReplyBox
          placeholder="说说想怎么改，它只重做这一条…"
          submitLabel="退回并说明"
          busy={busyOn === "reject"}
          onSubmit={text => void actions.reject([item], text)}
          onCancel={() => setComposer(null)}
        />
      ) : composer === "continue" ? (
        <ReplyBox
          placeholder="告诉它接下来怎么改…"
          submitLabel="发送"
          busy={busyOn === "continue"}
          onSubmit={text => {
            void actions.continueEdit(item, text).then(sent => {
              if (sent) setComposer(null);
            });
          }}
          onCancel={() => setComposer(null)}
        />
      ) : null}
    </>
  );
}

function EditActions({
  item,
  actions,
  setComposer,
}: {
  item: ContentSuggestion;
  actions: SuggestionActions;
  setComposer(next: Composer): void;
}) {
  const busyOn = actions.busyOn(item);
  const direct = item.mode === "direct";
  if (item.status === "pending")
    return (
      <>
        <RowAction
          icon={MessageCircle}
          label="回复"
          disabled={actions.busy}
          onClick={() => setComposer("reply")}
        />
        <RowAction
          icon={X}
          label={direct ? "这段不用它了" : "退回"}
          tone="danger"
          busy={busyOn === "reject"}
          disabled={actions.busy}
          onClick={() => void actions.reject([item])}
        />
        <RowAction
          icon={Check}
          label={direct ? "让它接着改" : "接受"}
          tone="ok"
          busy={busyOn === "accept"}
          disabled={actions.busy}
          onClick={() => void actions.accept([item])}
        />
      </>
    );
  if (item.status !== "accepted" && item.status !== "undone") return null;
  return (
    <>
      <RowAction
        icon={Pencil}
        label="继续修改"
        disabled={actions.busy}
        onClick={() => setComposer("continue")}
      />
      {item.status === "accepted" && item.applied ? (
        <RowAction
          icon={Undo2}
          label="撤销"
          busy={busyOn === "undo"}
          disabled={actions.busy}
          onClick={() => void actions.undo([item])}
        />
      ) : null}
    </>
  );
}

export function SuggestionCard({
  item,
  actions,
  index,
  onLocate,
}: {
  item: ContentSuggestion;
  actions: SuggestionActions;
  /** 在一次修改里的序号，从 1 开始；省略时不显示 */
  index?: number;
  onLocate?: () => void;
}) {
  const agent = agentNameOf(item);
  const focused = useSuggestionFocus(state =>
    state.focused?.id === item.id ? state.focused : null
  );
  const [composer, setComposer] = useState<Composer>(null);
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focused?.from !== "mark") return;
    row.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focused]);
  useEffect(() => {
    if (item.status !== "pending" && composer === "reply") setComposer(null);
  }, [item.status, composer]);

  const isEdit = item.kind === "edit";
  const hoverActions =
    isEdit && !composer ? (
      <EditActions item={item} actions={actions} setComposer={setComposer} />
    ) : null;

  return (
    <div
      style={agentColorStyle(agent)}
      data-suggestion-card={item.id}
      ref={row}
      className={cn(
        "group/suggestion text-tau-sm text-ink-1 relative flex gap-2",
        isEdit && "cursor-pointer",
        item.status === "superseded" && "opacity-60"
      )}
      onClick={
        isEdit
          ? () => {
              if (focused) useSuggestionFocus.getState().clear(item.id);
              else focusSuggestionInDocument(item.id);
            }
          : undefined
      }
    >
      {index ? (
        <span className="text-tau-micro text-ink-3 w-4 shrink-0 pt-[3px] text-right tabular-nums">
          {index}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        {isEdit ? (
          <EditBody
            item={item}
            actions={actions}
            composer={composer}
            setComposer={setComposer}
            onLocate={onLocate}
          />
        ) : (
          <QuestionBody item={item} actions={actions} />
        )}
      </div>
      {item.kind === "question" && item.status !== "pending" ? (
        <span className="shrink-0 pt-0.5">
          <StatusPill item={item} />
        </span>
      ) : null}
      {hoverActions ? (
        <div
          className={cn(
            "bg-surface border-line-1 shadow-card rounded-tau-sm absolute -top-1 right-0 flex gap-0.5 border p-0.5",
            "pointer-events-none opacity-0 transition-opacity duration-[160ms]",
            "group-focus-within/suggestion:pointer-events-auto group-focus-within/suggestion:opacity-100 group-hover/suggestion:pointer-events-auto group-hover/suggestion:opacity-100",
            (focused || actions.busyOn(item)) && "pointer-events-auto opacity-100"
          )}
        >
          {hoverActions}
        </div>
      ) : null}
    </div>
  );
}
