import { useLayoutEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Copy,
  Languages,
  List,
  MessageCircle,
  MessageSquareText,
  Quote,
  Sparkles,
  Trash2,
} from "lucide-react";
import { HIGHLIGHT_COLORS, type HighlightColor } from "@tau/shared/browser-companion";
import { cn } from "@tau/ui";
import { HIGHLIGHT_HEX } from "../page/highlights";
import { useCompanion } from "../state/store";
import { useController, useEscLayer } from "./context";

const COLOR_NAMES: Record<HighlightColor, string> = {
  yellow: "黄",
  green: "绿",
  blue: "蓝",
  purple: "紫",
  red: "红",
};

export function Swatch({
  color,
  size = 18,
  current = false,
}: {
  color: HighlightColor;
  size?: number;
  current?: boolean;
}) {
  const hex = HIGHLIGHT_HEX[color];
  return (
    <span
      className="block rounded-full"
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${hex} 30%, var(--tau-bg-surface))`,
        boxShadow: current
          ? `inset 0 0 0 1.5px ${hex}, 0 0 0 2px var(--tau-bg-surface), 0 0 0 3.5px ${hex}`
          : `inset 0 0 0 1.5px color-mix(in srgb, ${hex} 80%, transparent)`,
      }}
    />
  );
}

const TOOLBAR_GAP = 8;

/**
 * 选区工具条：只属于「选中」这个意图——选中文字或点中已有标注才出现，悬停正文什么都不出。
 * 新选区：五色高亮、批注、问 AI、摘录、复制；已有标注：换色、批注、问 AI、删除。
 */
export function SelectionToolbar() {
  const controller = useController();
  const selection = useCompanion(state => state.selection);
  const annotations = useCompanion(state => state.annotations);
  const ref = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useEscLayer(Boolean(selection), () => (menu ? setMenu(false) : controller.clearSelection()));

  useLayoutEffect(() => {
    setMenu(false);
  }, [selection?.annotationId, selection?.text]);

  useLayoutEffect(() => {
    if (!selection || !ref.current) return setPosition(null);
    const width = ref.current.offsetWidth;
    const { rect } = selection;
    const left = Math.max(
      12,
      Math.min(innerWidth - width - 12, rect.left + rect.width / 2 - width / 2)
    );
    let top = rect.top - 38 - TOOLBAR_GAP;
    if (top < 12) top = rect.bottom + TOOLBAR_GAP;
    setPosition({ left, top });
  }, [selection]);

  if (!selection) return null;
  const current = selection.annotationId
    ? annotations.find(item => item.id === selection.annotationId)
    : undefined;

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="选中文字的操作"
      onMouseDown={event => event.preventDefault()}
      className="bg-surface shadow-float animate-tau-pop rounded-tau-md fixed z-40 flex h-[38px] items-center gap-0.5 px-[5px]"
      style={position ?? { left: -9999, top: -9999 }}
    >
      {HIGHLIGHT_COLORS.map(color => (
        <button
          key={color}
          type="button"
          title={`${COLOR_NAMES[color]}色高亮`}
          aria-label={`${COLOR_NAMES[color]}色高亮`}
          onClick={() => controller.highlight(color)}
          className="hover:bg-hover rounded-tau-sm grid h-7 w-[26px] place-items-center"
        >
          <Swatch color={color} current={current?.color === color} />
        </button>
      ))}
      <Divider />
      <ToolButton icon={MessageSquareText} onClick={() => controller.annotate()}>
        批注
      </ToolButton>
      <div className="relative">
        <ToolButton icon={Sparkles} accent onClick={() => setMenu(open => !open)}>
          问 AI
          <ChevronDown size={13} strokeWidth={1.8} className="text-ink-3 -ml-0.5" />
        </ToolButton>
        {menu && (
          <div
            role="menu"
            className="bg-surface shadow-float rounded-tau-md absolute top-[38px] left-0 z-10 min-w-[168px] p-1"
          >
            <MenuItem icon={Sparkles} onClick={() => void controller.quickAsk("explain")}>
              解释
            </MenuItem>
            <MenuItem icon={Languages} onClick={() => void controller.quickAsk("translate")}>
              翻译
            </MenuItem>
            <MenuItem icon={List} onClick={() => void controller.quickAsk("summarize")}>
              概括这段
            </MenuItem>
            <MenuItem icon={MessageCircle} onClick={() => void controller.quickAsk("free")}>
              自由提问…
            </MenuItem>
          </div>
        )}
      </div>
      {selection.annotationId ? (
        <>
          <Divider />
          <ToolButton
            icon={Trash2}
            danger
            onClick={() => controller.removeAnnotation(selection.annotationId!)}
          >
            删除
          </ToolButton>
        </>
      ) : (
        <>
          <ToolButton icon={Quote} onClick={() => controller.excerpt()}>
            摘录
          </ToolButton>
          <Divider />
          <ToolButton icon={Copy} label="复制" onClick={() => controller.copySelection()} />
        </>
      )}
    </div>
  );
}

const Divider = () => <span className="bg-line-1 mx-1 h-[18px] w-px" />;

function ToolButton({
  icon: Icon,
  children,
  label,
  accent,
  danger,
  onClick,
}: {
  icon: typeof Copy;
  children?: React.ReactNode;
  label?: string;
  accent?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "text-ink-1 hover:bg-hover group/tool inline-flex h-7 items-center gap-[5px] whitespace-nowrap rounded-tau-sm px-2",
        danger && "hover:bg-danger-soft hover:text-danger"
      )}
    >
      <Icon
        size={15}
        strokeWidth={1.8}
        className={cn(
          accent ? "text-accent-text" : "text-ink-2",
          danger && "group-hover/tool:text-danger"
        )}
      />
      {children}
    </button>
  );
}

function MenuItem({
  icon: Icon,
  onClick,
  children,
}: {
  icon: typeof Copy;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="text-ink-1 hover:bg-hover rounded-tau-sm flex h-[30px] w-full items-center gap-2 px-2 text-left"
    >
      <Icon size={15} strokeWidth={1.8} className="text-ink-2" />
      {children}
    </button>
  );
}
