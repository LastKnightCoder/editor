/** 阅读区头部：图标 + 标题 + 元信息，右侧动作，末尾「对话」开关与关闭（不传对应回调则不显示） */

import type { ReactNode } from "react";
import { MessageCircle, X } from "lucide-react";
import { IconButton, Tooltip, cn } from "@tau/ui";

interface StageHeaderProps {
  icon: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  chatOpen?: boolean;
  onToggleChat?: () => void;
  onClose?: () => void;
}

export function StageHeader({
  icon,
  title,
  meta,
  actions,
  chatOpen,
  onToggleChat,
  onClose,
}: StageHeaderProps) {
  return (
    <div className="flex h-[52px] shrink-0 items-center gap-2 pl-5 pr-3">
      <span className="text-ink-2 grid shrink-0 place-items-center">{icon}</span>
      <div className="text-tau-body min-w-0 truncate font-semibold">{title}</div>
      {meta && <span className="text-tau-sm text-ink-3 shrink-0 whitespace-nowrap">{meta}</span>}
      <span className="flex-1" />
      {actions}
      {onToggleChat && (
        <Tooltip content={chatOpen ? "收起对话" : "展开对话"} placement="bottom">
          <IconButton
            aria-label={chatOpen ? "收起对话" : "展开对话"}
            aria-pressed={chatOpen}
            onClick={onToggleChat}
            className={cn(chatOpen && "bg-selected text-accent-text enabled:hover:bg-selected")}
          >
            <MessageCircle className="size-4" strokeWidth={1.75} />
          </IconButton>
        </Tooltip>
      )}
      {onClose && (
        <Tooltip content="关闭" placement="bottom">
          <IconButton aria-label="关闭" onClick={onClose}>
            <X className="size-4" strokeWidth={1.75} />
          </IconButton>
        </Tooltip>
      )}
    </div>
  );
}
