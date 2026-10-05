/**
 * 单条消息（D-048，桌面与浏览器扩展共用）：
 *  - 用户：右对齐气泡（accent-soft 轻染，右下角收尖），附件在气泡上方；
 *  - 助手：无气泡通栏正文（气泡与背景同色、只靠阴影才分得出，反而显糊），思考 / 工具调用为轻量折叠行，按内容块原序排列；
 *  - 操作：消息下方固定高度一行，悬停原位淡入（不顶开布局）；
 *  - 版本：会话树上同一位置有多个用户消息版本时，操作行末尾常显 ‹ i/n ›（M4-d）。
 */

import { memo, useMemo, useState, type ReactNode } from "react";
import {
  Check,
  ChevronLeft,
  CircleHelp,
  ChevronRight,
  Copy,
  FileText,
  FolderOpen,
  GitBranch,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  getDisplayTextFromBlocks,
  type ContentBlock,
  type ToolCallExecutionState,
} from "@tau/shared/chat-renderers";
import { IconButton, Tooltip, cn, toast } from "@tau/ui";
import { ReasoningBlock } from "./ReasoningBlock";

export interface MessageViewImage {
  url: string;
  alt?: string;
}

export interface MessageViewFile {
  path: string;
  name: string;
}

export interface MessageMarkdownParams {
  content: string;
  blockIndex?: number;
  isLastTextBlock?: boolean;
  textContent?: string;
}

export interface MessageViewProps {
  role: "user" | "assistant";
  messageIndex: number;
  userText?: string;
  images?: MessageViewImage[];
  files?: MessageViewFile[];
  assistantBlocks?: ContentBlock[];
  onDelete?: (messageIndex: number) => void;
  onRegenerate?: (messageIndex: number) => void;
  regenerateLabel?: string;
  onCreateBranch?: (messageIndex: number) => void;
  /** 用户消息「转为问题」（提问即疑问）；不传则不显示 */
  onToQuestion?: (messageIndex: number) => void;
  onEditUserMessage?: (messageIndex: number, content: string) => void;
  /** 会话树上这条用户消息的版本（编辑重发/重新生成/建分支产生）；有多个时显示 ‹ i/n › */
  versions?: { index: number; count: number };
  /** 切到第 versionIndex 个版本（缺省或运行中则按钮禁用） */
  onSwitchVersion?: (messageIndex: number, versionIndex: number) => void;
  onOpenFile?: (file: MessageViewFile) => void;
  renderMarkdown: (params: MessageMarkdownParams) => ReactNode;
  renderImage: (image: MessageViewImage, index: number, className: string) => ReactNode;
  renderToolCall: (execution: ToolCallExecutionState, index: number) => ReactNode;
}

function Action({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip content={label} placement="bottom" delay={300}>
      <IconButton aria-label={label} className="size-[26px] [&_svg]:size-3.5" onClick={onClick}>
        {children}
      </IconButton>
    </Tooltip>
  );
}

export const MessageView = memo(function MessageView({
  role,
  messageIndex,
  userText = "",
  images = [],
  files = [],
  assistantBlocks = [],
  onDelete,
  onRegenerate,
  regenerateLabel = "重新生成",
  onCreateBranch,
  onToQuestion,
  onEditUserMessage,
  versions,
  onSwitchVersion,
  onOpenFile,
  renderMarkdown,
  renderImage,
  renderToolCall,
}: MessageViewProps) {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);

  const blocks = useMemo(
    () =>
      assistantBlocks.filter(block => {
        if (block.type === "text" || block.type === "reasoning")
          return block.content.trim().length > 0;
        if (block.type === "tool_calls") return block.executions.length > 0;
        return true;
      }),
    [assistantBlocks]
  );
  // 相邻的工具调用块合并成一组（流式里每次调用各成一块，逐块留白会把列表拉得很散）
  const segments = useMemo(() => {
    const out: Array<{ block: ContentBlock; index: number }> = [];
    blocks.forEach((block, index) => {
      const prev = out[out.length - 1];
      if (block.type === "tool_calls" && prev?.block.type === "tool_calls") {
        prev.block = { ...prev.block, executions: [...prev.block.executions, ...block.executions] };
      } else {
        out.push({ block, index });
      }
    });
    return out;
  }, [blocks]);
  const lastTextIndex = useMemo(() => {
    for (let i = blocks.length - 1; i >= 0; i--) if (blocks[i].type === "text") return i;
    return -1;
  }, [blocks]);

  const visible = isUser
    ? userText.trim().length > 0 || images.length > 0 || files.length > 0
    : blocks.length > 0;
  if (!visible) return null;

  const copyText = isUser ? userText : getDisplayTextFromBlocks(blocks);
  const copy = async () => {
    if (!copyText.trim()) return;
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("复制失败");
    }
  };

  // 版本切换常显（悬停才出现的话用户不知道这里还有别的版本）
  const versionSwitcher =
    isUser && versions && versions.count > 1 ? (
      <div
        role="group"
        aria-label={`版本 ${versions.index + 1} / ${versions.count}`}
        className="text-tau-meta text-ink-3 flex items-center"
      >
        <IconButton
          aria-label="上一个版本"
          className="size-[22px] [&_svg]:size-3.5"
          disabled={!onSwitchVersion || versions.index === 0}
          onClick={() => onSwitchVersion?.(messageIndex, versions.index - 1)}
        >
          <ChevronLeft />
        </IconButton>
        <span className="min-w-[2.5em] text-center tabular-nums" aria-live="polite">
          {versions.index + 1}/{versions.count}
        </span>
        <IconButton
          aria-label="下一个版本"
          className="size-[22px] [&_svg]:size-3.5"
          disabled={!onSwitchVersion || versions.index === versions.count - 1}
          onClick={() => onSwitchVersion?.(messageIndex, versions.index + 1)}
        >
          <ChevronRight />
        </IconButton>
      </div>
    ) : null;

  const hoverActions = (
    <div
      className={cn(
        "ease-tau-out flex h-[26px] gap-0.5 opacity-0 transition-opacity duration-[160ms]",
        "focus-within:opacity-100 group-hover/msg:opacity-100",
        isUser ? "justify-end" : "-ml-1.5"
      )}
    >
      <Action label={copied ? "已复制" : "复制"} onClick={() => void copy()}>
        {copied ? <Check className="text-ok" /> : <Copy />}
      </Action>
      {isUser && onEditUserMessage && userText.trim() && (
        <Action label="编辑" onClick={() => onEditUserMessage(messageIndex, userText)}>
          <Pencil />
        </Action>
      )}
      {isUser && onToQuestion && userText.trim() && (
        <Action label="转为问题" onClick={() => onToQuestion(messageIndex)}>
          <CircleHelp />
        </Action>
      )}
      {isUser && onRegenerate && (
        <Action label={regenerateLabel} onClick={() => onRegenerate(messageIndex)}>
          <RefreshCw />
        </Action>
      )}
      {!isUser && onCreateBranch && (
        <Action label="从这里创建分支" onClick={() => onCreateBranch(messageIndex)}>
          <GitBranch />
        </Action>
      )}
      {onDelete && (
        <Action label="删除" onClick={() => onDelete(messageIndex)}>
          <Trash2 />
        </Action>
      )}
    </div>
  );

  const actions = versionSwitcher ? (
    <div className="flex items-center justify-end gap-1">
      {hoverActions}
      {versionSwitcher}
    </div>
  ) : (
    hoverActions
  );

  if (isUser) {
    return (
      <div className="group/msg flex flex-col items-end gap-1">
        {images.length > 0 && (
          <div className="flex max-w-[82%] flex-wrap justify-end gap-2">
            {images.map((image, index) =>
              renderImage(
                image,
                index,
                "border-line-1 rounded-tau-md size-24 cursor-zoom-in border object-cover"
              )
            )}
          </div>
        )}
        {files.length > 0 && (
          <div className="flex max-w-[82%] flex-col items-end gap-1.5">
            {files.map((file, index) => (
              <button
                type="button"
                key={`${file.path}-${index}`}
                onClick={() => onOpenFile?.(file)}
                title="在文件夹中显示"
                className="border-line-1 bg-surface hover:bg-surface-hover rounded-tau-sm group/file flex max-w-full items-center gap-2 border py-1.5 pl-2.5 pr-3 text-left"
              >
                <FileText size={15} strokeWidth={1.75} className="text-danger shrink-0" />
                <span className="text-tau-meta text-ink-1 min-w-0 truncate">{file.name}</span>
                <FolderOpen
                  size={13}
                  strokeWidth={1.75}
                  className="text-ink-3 shrink-0 opacity-0 transition-opacity group-hover/file:opacity-100"
                />
              </button>
            ))}
          </div>
        )}
        {userText.trim() && (
          <div className="bg-accent/[0.18] text-tau-body-lg text-ink-1 max-w-[82%] rounded-[14px_14px_4px_14px] px-3.5 py-2 [overflow-wrap:anywhere]">
            {renderMarkdown({ content: userText })}
          </div>
        )}
        {actions}
      </div>
    );
  }

  return (
    <div className="group/msg flex min-w-0 flex-col items-start">
      <div className="text-tau-body-lg text-ink-1 w-full min-w-0 [overflow-wrap:anywhere]">
        {segments.map(({ block, index }) => {
          if (block.type === "text") {
            return (
              <div key={`text-${index}`} className="my-2 first:mt-0 last:mb-0">
                {renderMarkdown({
                  content: block.content,
                  blockIndex: index,
                  isLastTextBlock: index === lastTextIndex,
                  textContent: block.content,
                })}
              </div>
            );
          }
          if (block.type === "reasoning") {
            return (
              <ReasoningBlock
                key={`reasoning-${index}`}
                startTime={block.startTime}
                endTime={block.endTime}
                duration={block.duration}
              >
                {renderMarkdown({ content: block.content })}
              </ReasoningBlock>
            );
          }
          if (block.type === "tool_calls") {
            return (
              <div key={`tools-${index}`} className="my-1.5 flex flex-col gap-0.5 first:mt-0">
                {block.executions.map((execution, execIndex) => (
                  <div key={execution.toolCallId || execIndex} className="min-w-0">
                    {renderToolCall(execution, execIndex)}
                  </div>
                ))}
              </div>
            );
          }
          return null;
        })}
      </div>
      <div className="mt-1">{actions}</div>
    </div>
  );
});
