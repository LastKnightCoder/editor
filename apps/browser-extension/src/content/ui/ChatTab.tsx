import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  Highlighter,
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

const SUGGESTIONS = [
  { icon: BookOpen, text: "总结本页" },
  { icon: List, text: "列出要点" },
  { icon: Search, text: "这篇的论证有哪些可以追问的地方" },
];

export function ChatTab() {
  const status = useCompanion(state => state.status);
  if (status.state !== "ready") return <ConnectionCard />;
  return <Conversation />;
}

function Conversation() {
  const controller = useController();
  const chat = useCompanion(state => state.chat);
  const canUseTools = useCompanion(state => state.status.scopes?.includes("tools") ?? false);
  const listRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [chat.messages]);

  const send = (text: string) => void controller.chat.ask(text, { quote: chat.quote });

  return (
    <>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-3">
        {chat.messages.length === 0 ? (
          <div className="px-0.5 pt-7 pb-2">
            <h3 className="text-tau-title-lg text-ink-1 mb-1 font-semibold">
              关于这页，想知道什么？
            </h3>
            <p className="text-tau-meta text-ink-3 mb-4">回答会标出原文出处，点编号可跳回原文。</p>
            {SUGGESTIONS.map(({ icon: Icon, text }) => (
              <Suggestion key={text} icon={Icon} onClick={() => send(text)}>
                {text}
              </Suggestion>
            ))}
            <Suggestion
              icon={Sparkles}
              onClick={() =>
                canUseTools
                  ? send("这页的内容和我在 Tau 里的笔记有什么关联？")
                  : showToast("需要在 Tau 设置 › 浏览器扩展 打开「使用 Tau 里的工具」")
              }
            >
              和我的笔记有什么关联
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
        {chat.error && <p className="text-tau-meta text-danger mt-2">{chat.error}</p>}
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
            onClick={() => void controller.chat.openInTau().catch(() => showToast("Tau 未连接"))}
            className="text-tau-sm text-ink-3 hover:text-accent-text inline-flex flex-none items-center gap-0.5 opacity-0 transition-opacity group-hover/tool:opacity-100"
          >
            在 Tau 中查看
            <ArrowUpRight size={12} strokeWidth={1.8} />
          </button>
        )}
      </div>
    ),
    [controller]
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
                  aria-label="存为笔记"
                  title="存为笔记"
                  className="size-[26px] [&_svg]:size-3.5"
                  onClick={() => {
                    controller.appendToNote(stripCites(text));
                    showToast("已存入页面笔记");
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
          title="把本页正文作为上下文"
          onClick={() => patchChat(current => ({ usePage: !current.usePage }))}
        >
          本页 · {length >= 1000 ? `${(length / 1000).toFixed(1)}k` : length} 字
        </ContextChip>
        {chat.quote && (
          <span className="bg-accent-soft text-accent-text text-tau-sm inline-flex h-6 max-w-[150px] items-center gap-1 rounded-full pr-1 pl-2.5">
            <Quote size={13} strokeWidth={1.8} className="flex-none" />
            <span className="truncate">{chat.quote.text}</span>
            <button
              type="button"
              aria-label="去掉引用"
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
          title="让 AI 参考本页的高亮与批注"
          onClick={() => patchChat(current => ({ useAnnotations: !current.useAnnotations }))}
        >
          我的标注
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
                  {model.isDefault && <span className="text-tau-sm text-ink-3">Tau 默认</span>}
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
          placeholder="问问这页…  ↵ 发送，⇧↵ 换行"
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
            aria-label="停止"
            onClick={() => void controller.chat.abort()}
            className="bg-ink-1 text-surface absolute right-2 bottom-2 grid size-7 place-items-center rounded-full"
          >
            <Square size={11} strokeWidth={0} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            aria-label="发送"
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
export function ConnectionCard() {
  const controller = useController();
  const status = useCompanion(state => state.status);
  const [help, setHelp] = useState(false);

  if (status.state === "pairing")
    return (
      <StateCard icon={KeyRound} tone="warn" title="在 Tau 中确认连接">
        <p>Tau 已弹出授权窗口，请核对校验码与下方一致后点「允许」。只需确认一次。</p>
        <div className="my-1 flex justify-center gap-1.5" aria-label={`校验码 ${status.code}`}>
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
          等待确认…
        </span>
        <div className="text-tau-sm text-ink-3 mt-3.5">
          <button
            type="button"
            className="text-accent-text"
            onClick={() => setHelp(value => !value)}
          >
            Tau 没有弹出窗口？
          </button>
          {help && (
            <ol className="text-ink-2 mx-auto mt-2 max-w-[260px] list-decimal pl-[18px] text-left">
              <li>确认 Tau 正在运行且已更新到最新版</li>
              <li>在 Tau「设置 › 浏览器扩展」打开「接受新的连接请求」</li>
              <li>多次拒绝后需等待 10 分钟再试</li>
            </ol>
          )}
        </div>
      </StateCard>
    );

  if (status.state === "connecting")
    return (
      <StateCard icon={Plug} title="正在连接 Tau…">
        <p>马上就好。</p>
      </StateCard>
    );

  const variants: Record<string, { title: string; body: string; action: string; tone?: "danger" }> =
    {
      denied: {
        title: "Tau 拒绝了连接",
        body: "如果是误操作，可以重新发起请求。",
        action: "重新请求",
        tone: "danger",
      },
      revoked: {
        title: "授权已在 Tau 中撤销",
        body: "本机保存的标注与笔记仍在，重新连接后继续同步。",
        action: "重新连接",
      },
      closed: {
        title: "Tau 暂不接受新连接",
        body: "在 Tau「设置 › 浏览器扩展」打开「接受新的连接请求」后再试。",
        action: "重试",
      },
      throttled: { title: "请求太频繁了", body: "连续被拒绝后需要等一会儿再试。", action: "重试" },
    };
  const variant = variants[status.state] ?? {
    title: "没有找到 Tau",
    body: "对话要用 Tau 里配置的模型。打开 Tau 后会自动连接；标注和笔记照常可用，连上后同步。",
    action: "重新连接",
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
