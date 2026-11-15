/**
 * 聊天引用的悬停预览卡：这一轮的提问 + 回答。摘录块的预览把摘录原文在回答里高亮出来。
 */

import { memo, type ReactNode } from "react";
import {
  GitBranch,
  Link2,
  Lock,
  Maximize2,
  MessageSquareQuote,
  PanelRightOpen,
  Unlink,
} from "lucide-react";
import { AnchoredPanel, Button, IconButton, PanelHasHeaderContext, Spinner, cn } from "@tau/ui";
import { MarkdownProvider } from "@/components/ChatSidebar/MarkdownContext";
import MarkdownRenderer from "@/components/ChatSidebar/MarkdownRenderer";
import { useChatMarkdownComponents } from "@/components/ChatUI/useChatMarkdownComponents";
import useTheme from "@/hooks/useTheme";
import { formatAgo } from "@/utils/formatAgo";
import type { ChatRefTarget } from "../queries";

interface ChatRefPreviewProps {
  title: string;
  /** undefined = 载入中，null = 对话或该轮已删除 */
  target: ChatRefTarget | null | undefined;
  error?: unknown;
  /** 引用的整个对话（不指向某一轮） */
  wholeSession: boolean;
  /** 协作者视角：对话只在创建者本机 */
  unshared: boolean;
  /** 摘录原文：在回答里高亮 */
  quote?: string;
  onOpenDock: () => void;
  onOpenPage: () => void;
  onCopyLink: () => void;
  /** 仅可编辑时提供：失效引用就地移除 */
  onRemove?: () => void;
}

const Header = ({
  icon: Icon,
  tone,
  title,
  meta,
}: {
  icon: typeof MessageSquareQuote;
  tone: string;
  title: string;
  meta: ReactNode;
}) => (
  <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-1">
    <span className={cn("rounded-tau-sm grid size-7 shrink-0 place-items-center", tone)}>
      <Icon className="size-[15px]" strokeWidth={1.75} />
    </span>
    <div className="min-w-0">
      <div className="text-tau-title text-ink-1 truncate leading-tight font-semibold">{title}</div>
      <div className="text-tau-micro text-ink-3 mt-0.5 truncate">{meta}</div>
    </div>
  </div>
);

export const ChatRefPreview = memo((props: ChatRefPreviewProps) => {
  const { title, target, error, wholeSession, unshared, quote } = props;
  const { isDark } = useTheme();
  const markdownComponents = useChatMarkdownComponents({ isDark, idPrefix: "chat-ref-block" });
  const name = target?.session.title || title || "无标题对话";

  if (unshared)
    return (
      <Header
        icon={Lock}
        tone="bg-warn-soft text-warn"
        title={name}
        meta="对话未共享，仅保存在创建者本机"
      />
    );

  if (error)
    return <Header icon={Unlink} tone="bg-hover text-ink-3" title={name} meta="读取对话失败" />;

  if (target === undefined)
    return (
      <div className="flex items-center gap-2 px-4 py-3.5">
        <Spinner className="size-3.5" />
        <span className="text-tau-meta text-ink-3">正在读取对话…</span>
      </div>
    );

  if (target === null || target.turn === null)
    return (
      <div className="pb-3">
        <Header
          icon={Unlink}
          tone="bg-hover text-ink-3"
          title={target ? name : "引用已失效"}
          meta={target ? "引用的这一轮已被删除" : "对话不存在或已被删除"}
        />
        {props.onRemove && (
          <div className="flex justify-end px-3 pt-1">
            <Button variant="ghost" size="sm" onClick={props.onRemove}>
              移除引用
            </Button>
          </div>
        )}
      </div>
    );

  const turn = target.turn;
  const meta = turn
    ? `第 ${turn.turn} / ${turn.turns} 轮 · ${formatAgo(turn.time)}`
    : `${target.session.messageCount} 轮 · ${formatAgo(target.session.updateTime)}`;

  return (
    <PanelHasHeaderContext.Provider value>
      <Header
        icon={MessageSquareQuote}
        tone="bg-accent-soft text-accent-text"
        title={name}
        meta={meta}
      />
      {turn && (
        <AnchoredPanel.Body className="text-tau-body-lg text-ink-1 max-h-[260px] leading-relaxed [overflow-wrap:anywhere]">
          <MarkdownProvider isDark={isDark} isVisible>
            {turn.ask.trim() && (
              <div className="border-line-1 rounded-tau-md mb-4 ml-auto w-fit max-w-[86%] border px-2.5 py-1.5">
                <MarkdownRenderer
                  content={turn.ask}
                  markdownComponents={markdownComponents}
                  shouldRender
                />
              </div>
            )}
            {turn.answer ? (
              <MarkdownRenderer
                content={turn.answer}
                markdownComponents={markdownComponents}
                highlightText={quote}
                shouldRender
              />
            ) : (
              <p className="text-ink-3 m-0">这一轮还没有回答</p>
            )}
          </MarkdownProvider>
          {!turn.onPath && (
            <div className="text-tau-micro text-warn mt-2 flex items-center gap-1">
              <GitBranch className="size-3" strokeWidth={1.75} />
              这一轮不在对话的当前分支上
            </div>
          )}
        </AnchoredPanel.Body>
      )}
      <AnchoredPanel.Footer className="justify-between py-2 pr-2.5 pl-2.5">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" icon={PanelRightOpen} onClick={props.onOpenDock}>
            在侧栏打开
          </Button>
          <Button variant="ghost" size="sm" icon={Maximize2} onClick={props.onOpenPage}>
            对话页
          </Button>
        </div>
        <IconButton
          title={wholeSession ? "复制对话链接" : "复制引用链接"}
          aria-label="复制引用链接"
          className="size-7"
          onClick={props.onCopyLink}
        >
          <Link2 size={14} strokeWidth={1.75} />
        </IconButton>
      </AnchoredPanel.Footer>
    </PanelHasHeaderContext.Provider>
  );
});
