/**
 * 阅读区底部悬浮 HUD：翻页 / 页码 / 缩放 / 查找 / 更多（页边、双页、旋转、夜间页面、全屏、在文件夹中显示、
 * 重建 AI 索引），对话关着时末尾多一个对话开关。常驻显示。
 */

import { pdfText, usePdfI18n } from "../../i18n";
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
  PanelRight,
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
  margin: boolean;
  /** 双页 / 旋转时页边不展开 */
  marginAvailable: boolean;
  onToggleMargin: () => void;
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
  usePdfI18n();

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
  usePdfI18n();

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
  usePdfI18n();

  const { page, total, zoomLabel } = props;
  return (
    <div className="bg-surface shadow-float absolute bottom-4 left-1/2 z-30 flex h-10 -translate-x-1/2 items-center gap-0.5 rounded-full px-1.5">
      {props.onToggleLeft && (
        <>
          <HudButton
            title={pdfText("reader.leftPanel")}
            onClick={props.onToggleLeft}
            pressed={props.leftOpen}
            className={props.leftOpen ? "text-accent-text" : undefined}
          >
            <PanelLeft {...ICON} />
          </HudButton>
          <Divider />
        </>
      )}
      <HudButton title={pdfText("navigation.previousShortcut")} onClick={props.onPrev}>
        <ChevronUp {...ICON} />
      </HudButton>
      <span className="text-tau-sm text-ink-2 min-w-[64px] px-1 text-center tabular-nums">
        <b className="text-ink-1 font-semibold">{page}</b> / {total}
      </span>
      <HudButton title={pdfText("navigation.nextShortcut")} onClick={props.onNext}>
        <ChevronDown {...ICON} />
      </HudButton>
      <Divider />
      <HudButton title={pdfText("zoom.out")} onClick={props.onZoomOut}>
        <Minus {...ICON} />
      </HudButton>
      <button
        type="button"
        title={pdfText("zoom.cycle")}
        onClick={props.onCycleZoom}
        className="rounded-tau-sm text-tau-sm text-ink-2 hover:bg-hover hover:text-ink-1 h-7 min-w-[52px] px-1.5 tabular-nums"
      >
        {zoomLabel}
      </button>
      <HudButton title={pdfText("zoom.in")} onClick={props.onZoomIn}>
        <Plus {...ICON} />
      </HudButton>
      <Divider />
      <HudButton
        title={props.handTool ? pdfText("pan.activeHint") : pdfText("pan.inactiveHint")}
        onClick={props.onToggleHand}
        pressed={props.handTool}
        className={
          props.handTool ? "bg-selected text-accent-text enabled:hover:bg-selected" : undefined
        }
      >
        <Hand {...ICON} />
      </HudButton>
      <HudButton title={pdfText("find.shortcut")} onClick={props.onFind}>
        <Search {...ICON} />
      </HudButton>
      <Menu
        align="end"
        className="w-[210px]"
        trigger={
          <IconButton
            title={pdfText("action.more")}
            aria-label={pdfText("action.more")}
            className="size-8"
          >
            <MoreHorizontal {...ICON} />
          </IconButton>
        }
      >
        <Menu.CheckboxItem
          checked={props.margin}
          onCheckedChange={props.onToggleMargin}
          disabled={!props.marginAvailable}
          icon={<PanelRight {...ICON} />}
          kbd="M"
        >
          {props.marginAvailable ? pdfText("note.margin") : pdfText("note.marginUnavailable")}
        </Menu.CheckboxItem>
        <Menu.CheckboxItem
          checked={props.spread}
          onCheckedChange={props.onToggleSpread}
          icon={<Columns2 {...ICON} />}
          kbd="D"
        >
          {pdfText("reader.spread")}
        </Menu.CheckboxItem>
        <Menu.Item icon={<RotateCw {...ICON} />} kbd="R" onSelect={props.onRotate}>
          {pdfText("reader.rotate")}
        </Menu.Item>
        <Menu.CheckboxItem
          checked={props.night}
          onCheckedChange={props.onToggleNight}
          icon={<Moon {...ICON} />}
        >
          {pdfText("reader.night")}
        </Menu.CheckboxItem>
        <Menu.Item icon={<Expand {...ICON} />} onSelect={props.onFullscreen}>
          {pdfText("reader.fullscreen")}
        </Menu.Item>
        {(props.onReveal || props.onRebuildIndex) && <Menu.Separator />}
        {props.onReveal && (
          <Menu.Item icon={<FolderOpen {...ICON} />} onSelect={props.onReveal}>
            {pdfText("file.reveal")}
          </Menu.Item>
        )}
        {props.onRebuildIndex && (
          <Menu.Item icon={<RefreshCw {...ICON} />} onSelect={props.onRebuildIndex}>
            {pdfText("index.rebuild")}
          </Menu.Item>
        )}
      </Menu>
      {props.onOpenChat && (
        <>
          <Divider />
          <HudButton
            title={pdfText("chat.openShortcut")}
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
