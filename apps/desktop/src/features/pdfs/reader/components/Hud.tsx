/**
 * 阅读区底部悬浮 HUD：翻页 / 页码 / 缩放 / 查找 / 更多（双页、旋转、夜间页面、全屏、在文件夹中显示、
 * 重建 AI 索引），对话关着时末尾多一个对话开关。常驻显示。
 */

import type { ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  Columns2,
  Expand,
  FolderOpen,
  Hand,
  MessageCircle,
  Minus,
  Moon,
  MoreHorizontal,
  PanelLeft,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
} from "lucide-react";
import { IconButton, Menu, cn } from "@tau/ui";

interface HudProps {
  page: number;
  total: number;
  zoomLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCycleZoom: () => void;
  onFind: () => void;
  /** 抓手工具常开（关着 = 选择文字） */
  handTool: boolean;
  onToggleHand: () => void;
  spread: boolean;
  onToggleSpread: () => void;
  onRotate: () => void;
  night: boolean;
  onToggleNight: () => void;
  onFullscreen: () => void;
  onReveal?: () => void;
  onRebuildIndex?: () => void;
  /** 宿主没有面包屑时（项目里的 PDF 条目）把左面板开关放进 HUD */
  onToggleLeft?: () => void;
  leftOpen?: boolean;
  /** 对话关着时给出开关 */
  onOpenChat?: () => void;
}

const ICON = { size: 16, strokeWidth: 1.75 } as const;

function Divider() {
  return <span aria-hidden className="bg-line-1 mx-1 h-4 w-px shrink-0" />;
}

function HudButton({
  title,
  onClick,
  children,
  className,
  pressed,
}: {
  title: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  pressed?: boolean;
}) {
  return (
    <IconButton
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn("size-8", className)}
    >
      {children}
    </IconButton>
  );
}

export function Hud(props: HudProps) {
  const { page, total, zoomLabel } = props;
  return (
    <div className="bg-surface shadow-float absolute bottom-4 left-1/2 z-30 flex h-10 -translate-x-1/2 items-center gap-0.5 rounded-full px-1.5">
      {props.onToggleLeft && (
        <>
          <HudButton
            title="左面板"
            onClick={props.onToggleLeft}
            pressed={props.leftOpen}
            className={props.leftOpen ? "text-accent-text" : undefined}
          >
            <PanelLeft {...ICON} />
          </HudButton>
          <Divider />
        </>
      )}
      <HudButton title="上一页 (←)" onClick={props.onPrev}>
        <ChevronUp {...ICON} />
      </HudButton>
      <span className="text-tau-sm text-ink-2 min-w-[64px] px-1 text-center tabular-nums">
        <b className="text-ink-1 font-semibold">{page}</b> / {total}
      </span>
      <HudButton title="下一页 (→)" onClick={props.onNext}>
        <ChevronDown {...ICON} />
      </HudButton>
      <Divider />
      <HudButton title="缩小" onClick={props.onZoomOut}>
        <Minus {...ICON} />
      </HudButton>
      <button
        type="button"
        title="切换 适宽 / 适页 / 100%"
        onClick={props.onCycleZoom}
        className="rounded-tau-sm text-tau-sm text-ink-2 hover:bg-hover hover:text-ink-1 h-7 min-w-[52px] px-1.5 tabular-nums"
      >
        {zoomLabel}
      </button>
      <HudButton title="放大" onClick={props.onZoomIn}>
        <Plus {...ICON} />
      </HudButton>
      <Divider />
      <HudButton
        title={
          props.handTool ? "抓手：拖动平移 (H)，再点回到选择文字" : "抓手 (H)，按住空格临时平移"
        }
        onClick={props.onToggleHand}
        pressed={props.handTool}
        className={
          props.handTool ? "bg-selected text-accent-text enabled:hover:bg-selected" : undefined
        }
      >
        <Hand {...ICON} />
      </HudButton>
      <HudButton title="查找 (Ctrl/⌘ F)" onClick={props.onFind}>
        <Search {...ICON} />
      </HudButton>
      <Menu
        align="end"
        className="w-[210px]"
        trigger={
          <IconButton title="更多" aria-label="更多" className="size-8">
            <MoreHorizontal {...ICON} />
          </IconButton>
        }
      >
        <Menu.CheckboxItem
          checked={props.spread}
          onCheckedChange={props.onToggleSpread}
          icon={<Columns2 {...ICON} />}
          kbd="D"
        >
          双页显示
        </Menu.CheckboxItem>
        <Menu.Item icon={<RotateCw {...ICON} />} kbd="R" onSelect={props.onRotate}>
          向右旋转
        </Menu.Item>
        <Menu.CheckboxItem
          checked={props.night}
          onCheckedChange={props.onToggleNight}
          icon={<Moon {...ICON} />}
        >
          夜间页面（反色）
        </Menu.CheckboxItem>
        <Menu.Item icon={<Expand {...ICON} />} onSelect={props.onFullscreen}>
          全屏阅读
        </Menu.Item>
        {(props.onReveal || props.onRebuildIndex) && <Menu.Separator />}
        {props.onReveal && (
          <Menu.Item icon={<FolderOpen {...ICON} />} onSelect={props.onReveal}>
            在文件夹中显示
          </Menu.Item>
        )}
        {props.onRebuildIndex && (
          <Menu.Item icon={<RefreshCw {...ICON} />} onSelect={props.onRebuildIndex}>
            重建 AI 索引
          </Menu.Item>
        )}
      </Menu>
      {props.onOpenChat && (
        <>
          <Divider />
          <HudButton
            title="打开对话 (Ctrl/⌘ J)"
            onClick={props.onOpenChat}
            className="text-accent-text"
          >
            <MessageCircle {...ICON} />
          </HudButton>
        </>
      )}
    </div>
  );
}
