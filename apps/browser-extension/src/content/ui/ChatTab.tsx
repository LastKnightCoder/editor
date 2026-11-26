import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  Highlighter,
  History,
  KeyRound,
  List,
  NotebookPen,
  Plug,
  Quote,
  Search,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import {
  getAssistantContentBlocks,
  Role,
  type ChatSessionMessage,
  type ResponseMessage,
} from "@tau/shared/chat-core";
import type { ContentBlock, ToolCallExecutionState } from "@tau/shared/chat-renderers";
import { useChatAutoScroll } from "@tau/shared/src/hooks/useChatAutoScroll";
import {
  MessageView,
  ToolApprovalBar,
  ToolCallBlock,
  ToolCallRow,
} from "@tau/chat-ui/conversation";
import { Button, cn, IconButton } from "@tau/ui";
import { messageText, PAGE_TOOLS, splitQuote } from "../state/chat";
import { stripCites } from "../state/controller";
import { patchChat, showToast, useCompanion } from "../state/store";
import { useController } from "./context";
import { Markdown } from "./Markdown";
import { sessionTitle } from "./SessionNav";
import { chatTranslator, chatIssueText, relativeDay, useContentChatI18n } from "../chat.i18n";
import { useConnectionI18n } from "../i18n";

const SUGGESTIONS = [
  { id: "summary", icon: BookOpen, request: "总结本页" },
  { id: "points", icon: List, request: "列出要点" },
  { id: "questions", icon: Search, request: "这篇的论证有哪些可以追问的地方" },
] as const;

export function ChatTab() {
  const status = useCompanion(state => state.status);
  if (status.state !== "ready") return <ConnectionCard />;
  return <Conversation />;
}

function Conversation() {
  const context = useContentChatI18n();
  const { t } = context;
  const controller = useController();
  const chat = useCompanion(state => state.chat);
  const canUseTools = useCompanion(state => state.status.scopes?.includes("tools") ?? false);
  const { containerRef, enableAutoScroll, scrollToBottom } = useChatAutoScroll<HTMLDivElement>({});

  useLayoutEffect(() => {
    enableAutoScroll();
  }, [chat.sessionId, enableAutoScroll]);

  useLayoutEffect(() => {
    scrollToBottom();
  }, [chat.sessionId, chat.messages, scrollToBottom]);

  const send = (text: string) => void controller.chat.ask(text, { quote: chat.quote });
  const recent = useMemo(
    () =>
      [...chat.sessions]
        .filter(item => item.id !== chat.sessionId)
        .sort((a, b) => b.updateTime - a.updateTime)
        .slice(0, 2),
    [chat.sessions, chat.sessionId]
  );

  return (
    <>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-3">
        {chat.messages.length === 0 ? (
          <div className="px-0.5 pt-7 pb-2">
            <h3 className="text-tau-title-lg text-ink-1 mb-1 font-semibold">{t("empty.title")}</h3>
            <p className="text-tau-meta text-ink-3 mb-4">{t("empty.hint")}</p>
            {recent.length > 0 && (
              <div className="mb-2">
                <p className="text-tau-micro text-ink-3 px-2.5 pb-1">{t("recent")}</p>
                {recent.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void controller.chat.switchSession(item.id)}
                    className="text-ink-2 hover:bg-hover rounded-tau-sm flex w-full items-center gap-2 px-2.5 py-[7px] text-left"
                  >
                    <History size={13} strokeWidth={1.8} className="text-ink-3 flex-none" />
                    <span className="min-w-0 flex-1 truncate">{sessionTitle(item)}</span>
                    <span className="text-tau-micro text-ink-3 flex-none tabular-nums">
                      {t("history.detail", {
                        time: relativeDay(item.updateTime, context),
                        count: item.messageCount,
                      })}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {SUGGESTIONS.map(({ id, icon: Icon, request }) => (
              <Suggestion key={id} icon={Icon} onClick={() => send(request)}>
                {t(`suggest.${id}`)}
              </Suggestion>
            ))}
            <Suggestion
              icon={Sparkles}
              onClick={() =>
                canUseTools
                  ? send("这页的内容和我在 Tau 里的笔记有什么关联？")
                  : showToast(chatTranslator.t("toast.toolsDisabled"))
              }
            >
              {t("suggest.related")}
            </Suggestion>
          </div>
        ) : (
          chat.messages.map((message, index) => (
            <ConversationMessage
              key={message.clientId ?? index}
              message={message}
              index={index}
              streaming={Boolean(chat.runId) && index === chat.messages.length - 1}
            />
          ))
        )}
        {chat.error && (
          <p className="text-tau-meta text-danger mt-2">{chatIssueText(chat.error)}</p>
        )}
      </div>
      <Composer onSend={send} />
    </>
  );
}

const PAGE_TOOL_NAMES = new Set((PAGE_TOOLS ?? []).map(tool => tool.function.name));

/**
 * 一条消息：与桌面对话同一个 MessageView——用户气泡、助手正文、思考与工具行按内容块原序排列，
 * 审批条与提问卡也是桌面同一套。桌面专用的工具卡片在这里退回通用工具行，旁边给「在 Tau 中查看」。
 */
const ConversationMessage = memo(function ConversationMessage({
  message,
  index,
  streaming,
}: {
  message: ChatSessionMessage;
  index: number;
  streaming: boolean;
}) {
  const { t } = useContentChatI18n();
  const controller = useController();
  const isDark = useCompanion(state => state.status.appearance?.mode === "dark");
  const isUser = message.role === Role.User;
  const { quote, body } = isUser
    ? splitQuote(messageText(message.content))
    : { quote: null, body: "" };
  const blocks = useMemo(
    () => (isUser ? [] : (getAssistantContentBlocks(message as ResponseMessage) as ContentBlock[])),
    [isUser, message]
  );
  const renderDefaultItem = useCallback(
    ({ execution }: { execution: ToolCallExecutionState }) => (
      <div className="group/tool flex min-w-0 items-center gap-1">
        <div className="min-w-0 flex-1">
          <ToolCallRow execution={execution} />
        </div>
        {!PAGE_TOOL_NAMES.has(execution.toolName) && execution.status === "success" && (
          <button
            type="button"
            onClick={() =>
              void controller.chat
                .openInTau()
                .catch(() => showToast(chatTranslator.t("toast.offline")))
            }
            className="text-tau-sm text-ink-3 hover:text-accent-text inline-flex flex-none items-center gap-0.5 opacity-0 transition-opacity group-hover/tool:opacity-100"
          >
            {t("viewTau")}
            <ArrowUpRight size={12} strokeWidth={1.8} />
          </button>
        )}
      </div>
    ),
    [controller, t]
  );

  return (
    <div className="my-3.5">
      {quote && (
        <div className="flex justify-end">
          <div className="border-accent text-tau-meta text-ink-2 mb-1.5 line-clamp-3 max-w-[85%] border-l-2 pl-2.5">
            {quote}
          </div>
        </div>
      )}
      <MessageView
        role={isUser ? "user" : "assistant"}
        messageIndex={index}
        userText={body}
        assistantBlocks={blocks}
        renderExtraActions={
          isUser || streaming
            ? undefined
            : text => (
                <IconButton
                  aria-label={t("saveNote")}
                  title={t("saveNote")}
                  className="size-[26px] [&_svg]:size-3.5"
                  onClick={() => {
                    controller.appendToNote(stripCites(text));
                    showToast(chatTranslator.t("toast.noteSaved"));
                  }}
                >
                  <NotebookPen strokeWidth={1.75} />
                </IconButton>
              )
        }
        renderMarkdown={({ content }) => <Markdown text={content} />}
        renderImage={(image, imageIndex, className) => (
          <img key={imageIndex} src={image.url} alt={image.alt ?? ""} className={className} />
        )}
        renderToolCall={execution => (
          <ToolCallBlock
            execution={execution}
            isDark={isDark}
            renderApproval={item => <ToolApprovalBar execution={item} />}
            renderDefaultItem={renderDefaultItem}
          />
        )}
      />
      {streaming && !isUser && blocks.length === 0 && (
        <span className="bg-accent inline-block h-3.5 w-[7px] animate-pulse rounded-[1px] align-[-2px]" />
      )}
    </div>
  );
});

function Suggestion({
  icon: Icon,
  onClick,
  children,
}: {
  icon: typeof X;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-ink-1 hover:bg-hover rounded-tau-sm flex w-full items-center gap-2.5 px-2.5 py-[9px] text-left"
    >
      <Icon size={16} strokeWidth={1.8} className="text-ink-3" />
      {children}
    </button>
  );
}

function Composer({ onSend }: { onSend: (text: string) => void }) {
  const { t } = useContentChatI18n();
  const controller = useController();
  const chat = useCompanion(state => state.chat);
  const length = controller.chat.content().length;
  const [value, setValue] = useState("");
  const [modelMenu, setModelMenu] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [chat.quote]);

  const submit = () => {
    const text = value.trim();
    if (!text || chat.runId) return;
    setValue("");
    onSend(text);
  };

  return (
    <div className="px-3 pt-2 pb-3">
      <div className="relative mb-2 flex flex-wrap items-center gap-1.5">
        <ContextChip
          active={chat.usePage}
          icon={BookOpen}
          title={t("context.pageHint")}
          onClick={() => patchChat(current => ({ usePage: !current.usePage }))}
        >
          {t("context.page", {
            length: length >= 1000 ? `${(length / 1000).toFixed(1)}k` : length,
          })}
        </ContextChip>
        {chat.quote && (
          <span className="bg-accent-soft text-accent-text text-tau-sm inline-flex h-6 max-w-[150px] items-center gap-1 rounded-full pr-1 pl-2.5">
            <Quote size={13} strokeWidth={1.8} className="flex-none" />
            <span className="truncate">{chat.quote.text}</span>
            <button
              type="button"
              aria-label={t("context.removeQuote")}
              onClick={() => patchChat({ quote: null })}
              className="hover:bg-press grid size-3.5 flex-none place-items-center rounded"
            >
              <X size={11} strokeWidth={2} />
            </button>
          </span>
        )}
        <ContextChip
          active={chat.useAnnotations}
          icon={Highlighter}
          title={t("context.annotationsHint")}
          onClick={() => patchChat(current => ({ useAnnotations: !current.useAnnotations }))}
        >
          {t("context.annotations")}
        </ContextChip>
        {chat.model && (
          <button
            type="button"
            onClick={() => setModelMenu(open => !open)}
            className="text-ink-2 hover:bg-hover text-tau-sm ml-auto inline-flex h-6 max-w-[150px] items-center gap-1 rounded-md pr-1.5 pl-2"
          >
            <span className="truncate">{chat.model.label}</span>
            <ChevronDown size={13} strokeWidth={1.8} className="flex-none" />
          </button>
        )}
        {modelMenu && (
          <div
            role="menu"
            className="bg-surface shadow-float rounded-tau-md absolute right-0 bottom-8 z-10 max-h-[240px] min-w-[220px] overflow-y-auto p-1"
          >
            {chat.models.map(model => {
              const current =
                chat.model?.providerId === model.providerId && chat.model.modelId === model.modelId;
              return (
                <button
                  key={`${model.providerId}/${model.modelId}`}
                  type="button"
                  role="menuitemradio"
                  aria-checked={current}
                  onClick={() => {
                    patchChat({ model });
                    setModelMenu(false);
                  }}
                  className="text-ink-1 hover:bg-hover rounded-tau-sm flex h-[30px] w-full items-center gap-2 px-2 text-left"
                >
                  <span className="grid w-4 place-items-center">
                    {current && <Check size={14} strokeWidth={2} />}
                  </span>
                  <span className="flex-1 truncate">{model.label}</span>
                  {model.isDefault && (
                    <span className="text-tau-sm text-ink-3">{t("model.default")}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="relative">
        <textarea
          ref={inputRef}
          rows={2}
          value={value}
          placeholder={t("composer.placeholder")}
          onChange={event => setValue(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          className="bg-surface text-ink-1 placeholder:text-ink-3 border-line-1 focus:border-accent rounded-tau-md block max-h-40 min-h-[72px] w-full resize-none border py-2.5 pr-11 pl-3 outline-none focus:shadow-[var(--tau-focus-ring)]"
        />
        {chat.runId ? (
          <button
            type="button"
            aria-label={t("stop")}
            onClick={() => void controller.chat.abort()}
            className="bg-ink-1 text-surface absolute right-2 bottom-2 grid size-7 place-items-center rounded-full"
          >
            <Square size={11} strokeWidth={0} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            aria-label={t("send")}
            disabled={!value.trim()}
            onClick={submit}
            className="bg-accent text-ink-inverse hover:bg-accent-hover disabled:bg-press disabled:text-ink-3 absolute right-2 bottom-2 grid size-7 place-items-center rounded-full"
          >
            <ArrowUp size={15} strokeWidth={2.2} />
          </button>
        )}
      </div>
    </div>
  );
}

function ContextChip({
  active,
  icon: Icon,
  title,
  onClick,
  children,
}: {
  active: boolean;
  icon: typeof X;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "text-tau-sm inline-flex h-6 items-center gap-[5px] rounded-full px-2.5 transition-colors",
        active
          ? "bg-accent-soft text-accent-text"
          : "border-line-1 text-ink-2 hover:bg-hover border"
      )}
    >
      <Icon size={13} strokeWidth={1.8} />
      {children}
    </button>
  );
}

/** 没连上 Tau 时的说明卡：未找到 / 等待授权（校验码）/ 被拒绝 / 被撤销 */
function ConnectionCard() {
  const { t } = useConnectionI18n();
  const controller = useController();
  const status = useCompanion(state => state.status);
  const [help, setHelp] = useState(false);

  if (status.state === "pairing")
    return (
      <StateCard icon={KeyRound} tone="warn" title={t("pair.title")}>
        <p>{t("pair.hint")}</p>
        <div
          className="my-1 flex justify-center gap-1.5"
          aria-label={t("pair.code", { code: status.code ?? "" })}
        >
          {(status.code ?? "").split("").map((digit, index) => (
            <span
              key={index}
              className="border-line-1 text-ink-1 grid h-[46px] w-[38px] place-items-center rounded-[10px] border font-mono text-[22px] font-semibold"
            >
              {digit}
            </span>
          ))}
        </div>
        <span className="text-tau-meta text-ink-3 mt-3 inline-flex items-center gap-2">
          <span className="border-line-1 border-t-accent size-[13px] animate-spin rounded-full border-[1.5px]" />
          {t("pair.waiting")}
        </span>
        <div className="text-tau-sm text-ink-3 mt-3.5">
          <button
            type="button"
            className="text-accent-text"
            onClick={() => setHelp(value => !value)}
          >
            {t("pair.help")}
          </button>
          {help && (
            <ol className="text-ink-2 mx-auto mt-2 max-w-[260px] list-decimal pl-[18px] text-left">
              <li>{t("pair.running")}</li>
              <li>{t("pair.accept")}</li>
              <li>{t("pair.cooldown")}</li>
            </ol>
          )}
        </div>
      </StateCard>
    );

  if (status.state === "connecting")
    return (
      <StateCard icon={Plug} title={t("connect.title")}>
        <p>{t("connect.soon")}</p>
      </StateCard>
    );

  if (status.state === "launching")
    return (
      <StateCard icon={Plug} title={t("launch.title")}>
        <p>{t("launch.hint")}</p>
        <span className="text-tau-sm text-ink-3 inline-flex items-center gap-2" role="status">
          <span className="border-line-1 border-t-accent size-[13px] animate-spin rounded-full border-[1.5px]" />
          {t("launch.confirm")}
        </span>
      </StateCard>
    );

  if (status.state === "offline" || status.state === "unpaired")
    return (
      <StateCard
        icon={Plug}
        title={status.launchTimedOut ? t("offline.timeout") : t("offline.title")}
      >
        {status.launchTimedOut && <p>{t("offline.hint")}</p>}
        <Button
          variant="primary"
          icon={ArrowUpRight}
          className="mx-auto mt-1"
          onClick={() => controller.openTau()}
        >
          {status.launchTimedOut ? t("offline.reopen") : t("offline.open")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => controller.retryConnect()}>
          {t("offline.check")}
        </Button>
      </StateCard>
    );

  const kind =
    status.state === "denied" ||
    status.state === "revoked" ||
    status.state === "closed" ||
    status.state === "throttled"
      ? status.state
      : "missing";
  const variant = {
    title: t(`${kind}.title`),
    body: t(`${kind}.body`),
    action: t(`${kind}.action`),
    tone: kind === "denied" ? ("danger" as const) : undefined,
  };
  return (
    <StateCard icon={Plug} tone={variant.tone} title={variant.title}>
      <p>{variant.body}</p>
      <Button variant="primary" className="mx-auto mt-1" onClick={() => controller.retryConnect()}>
        {variant.action}
      </Button>
    </StateCard>
  );
}

function StateCard({
  icon: Icon,
  tone,
  title,
  children,
}: {
  icon: typeof X;
  tone?: "warn" | "danger";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="m-auto flex flex-col items-center px-7 py-6 text-center">
      <span
        className={cn(
          "mb-3.5 grid size-11 place-items-center rounded-full",
          tone === "warn"
            ? "bg-warn-soft text-warn"
            : tone === "danger"
              ? "bg-danger-soft text-danger"
              : "bg-hover text-ink-3"
        )}
      >
        <Icon size={18} strokeWidth={1.8} />
      </span>
      <h3 className="text-tau-title text-ink-1 mb-1.5 font-semibold">{title}</h3>
      <div className="text-tau-meta text-ink-2 flex max-w-[280px] flex-col items-center gap-3">
        {children}
      </div>
    </div>
  );
}
