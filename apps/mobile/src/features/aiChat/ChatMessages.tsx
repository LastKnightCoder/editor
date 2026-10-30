// 消息列表：与桌面、浏览器扩展同一套 MessageView（用户气泡、助手通栏、思考与工具行按原序），
// 宿主工具行换成可读叫法；生成中用户上滑阅读时停止跟随，出现「回到最新」。

import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowDown } from "lucide-react";
import {
  getAssistantContentBlocks,
  Role,
  type ChatSessionMessage,
  type ResponseMessage,
} from "@tau/shared/chat-core";
import type { ContentBlock, ToolCallExecutionState } from "@tau/shared/chat-renderers";
import {
  MarkdownRenderer,
  MessageView,
  ToolApprovalBar,
  ToolCallBlock,
  ToolCallRow,
} from "@tau/chat-ui/conversation";
import { useThemeStore } from "@tau/themes/react";
import { TOOL_LABELS } from "./interactions";

const FOLLOW_SLOP_PX = 80;

function userText(content: ChatSessionMessage["content"]) {
  if (typeof content === "string") return content;
  return content
    .map(part => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

/** 宿主工具的可读叫法；插件与未知工具返回 undefined，回落为工具名 */
function toolTitle(execution: ToolCallExecutionState) {
  const label = TOOL_LABELS[execution.toolName];
  return label ? <span className="text-tau-meta">{label}</span> : undefined;
}

const ToolLine = memo(function ToolLine({ execution }: { execution: ToolCallExecutionState }) {
  return <ToolCallRow execution={execution} title={toolTitle(execution)} />;
});

const ChatMessage = memo(function ChatMessage(props: {
  message: ChatSessionMessage;
  index: number;
  streaming: boolean;
  isDark: boolean;
}) {
  const { message, index, streaming, isDark } = props;
  const isUser = message.role === Role.User;
  const blocks = useMemo(
    () => (isUser ? [] : (getAssistantContentBlocks(message as ResponseMessage) as ContentBlock[])),
    [isUser, message]
  );
  const renderDefaultItem = useCallback(
    ({ execution }: { execution: ToolCallExecutionState }) => <ToolLine execution={execution} />,
    []
  );
  return (
    <div className="my-3.5">
      <MessageView
        role={isUser ? "user" : "assistant"}
        messageIndex={index}
        userText={isUser ? userText(message.content) : undefined}
        assistantBlocks={blocks}
        renderMarkdown={({ content }) => (
          <MarkdownRenderer content={content} isDark={isDark} enableDocumentReference />
        )}
        renderImage={(image, imageIndex, className) => (
          <img key={imageIndex} src={image.url} alt={image.alt ?? ""} className={className} />
        )}
        renderToolCall={execution => (
          <ToolCallBlock
            execution={execution}
            isDark={isDark}
            renderApproval={item => <ToolApprovalBar execution={item} />}
            renderDefaultItem={renderDefaultItem}
            toolTitle={toolTitle}
          />
        )}
      />
      {streaming && !isUser && blocks.length === 0 && (
        <span className="bg-accent inline-block h-2 w-2 animate-pulse rounded-full" />
      )}
    </div>
  );
});

export function ChatMessages(props: {
  messages: ChatSessionMessage[];
  running: boolean;
  /** 列表为空时的内容（建议问题） */
  empty?: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const [detached, setDetached] = useState(false);
  const isDark = useThemeStore(state => state.mode === "dark");

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (node && followRef.current) node.scrollTop = node.scrollHeight;
  }, [props.messages]);

  const onScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < FOLLOW_SLOP_PX;
    followRef.current = atBottom;
    setDetached(!atBottom);
  };
  const toLatest = () => {
    const node = scrollRef.current;
    if (!node) return;
    followRef.current = true;
    setDetached(false);
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        data-allow-touchmove="true"
        className="h-full overflow-y-auto overscroll-contain px-[18px] pb-2"
      >
        {props.messages.length === 0
          ? props.empty
          : props.messages.map((message, index) => (
              <ChatMessage
                key={(message as { clientId?: string }).clientId ?? index}
                message={message}
                index={index}
                isDark={isDark}
                streaming={props.running && index === props.messages.length - 1}
              />
            ))}
      </div>
      {detached && props.messages.length > 0 && (
        <button
          type="button"
          onClick={toLatest}
          className="bg-surface text-ink-2 shadow-float text-tau-sm absolute bottom-3 left-1/2 flex h-8 -translate-x-1/2 items-center gap-1 rounded-full px-3 font-semibold"
        >
          <ArrowDown size={13} aria-hidden="true" />
          {props.running ? "回到最新" : "回到底部"}
        </button>
      )}
    </div>
  );
}
