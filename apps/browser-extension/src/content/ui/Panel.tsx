import { useEffect, useRef, useState } from "react";
import { EyeOff, Library, MoreHorizontal, Pin, RotateCcw, X } from "lucide-react";
import { cn, IconButton } from "@tau/ui";
import { useCompanion, type PanelTab } from "../state/store";
import { useController, useEscLayer } from "./context";
import { ChatTab } from "./ChatTab";
import { AnnotationsTab } from "./AnnotationsTab";
import { NoteTab } from "./NoteTab";
import { SessionNav } from "./SessionNav";
import { useConnectionI18n } from "../i18n";

const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 340;
const MAX_WIDTH = 720;
const MIN_HEIGHT = 420;

interface Frame {
  left: number;
  top: number;
  width: number;
  height: number;
}

const STATUS_DOT: Record<string, string> = {
  ready: "bg-ok",
  pairing: "bg-warn",
  connecting: "bg-warn",
  launching: "bg-warn",
};
const TABS: PanelTab[] = ["chat", "annotations", "note"];

/** 默认位置：贴着悬浮球那一侧，底边与球对齐 */
const defaultFrame = (side: "left" | "right", orbRatio: number): Frame => {
  const height = Math.min(640, innerHeight - 96);
  const top = Math.max(
    16,
    Math.min(innerHeight - height - 16, orbRatio * innerHeight + 18 - height)
  );
  const width = Math.min(DEFAULT_WIDTH, innerWidth - 96);
  return { left: side === "right" ? innerWidth - width - 64 : 64, top, width, height };
};

/** 浮窗面板：可拖可缩放，页签 对话 / 标注 / 笔记；Esc 关闭 */
export function Panel() {
  const { t, locale } = useConnectionI18n();
  const controller = useController();
  const open = useCompanion(state => state.panelOpen);
  const tab = useCompanion(state => state.tab);
  const side = useCompanion(state => state.side);
  const orbRatio = useCompanion(state => state.orbRatio);
  const status = useCompanion(state => state.status.state);
  const count = useCompanion(state => state.annotations.length);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [menu, setMenu] = useState(false);
  const [pinned, setPinned] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useEscLayer(open, () => (menu ? setMenu(false) : controller.closePanel()));

  // 未固定时切到别的标签页就收起
  useEffect(() => {
    if (!open || pinned) return;
    const onHidden = () => document.visibilityState === "hidden" && controller.closePanel();
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [open, pinned, controller]);

  if (!open) return null;
  const current = frame ?? defaultFrame(side, orbRatio);
  const statusInfo = {
    label:
      status === "ready" ||
      status === "pairing" ||
      status === "connecting" ||
      status === "launching"
        ? t(`status.${status}`)
        : t("status.offline"),
    dot: STATUS_DOT[status] ?? "bg-ink-3",
  };

  const startDrag = (event: React.PointerEvent) => {
    if ((event.target as Element).closest("button")) return;
    const origin = { x: event.clientX, y: event.clientY, frame: current };
    const move = (moveEvent: PointerEvent) =>
      setFrame({
        ...origin.frame,
        left: Math.max(
          8,
          Math.min(
            innerWidth - origin.frame.width - 8,
            origin.frame.left + moveEvent.clientX - origin.x
          )
        ),
        top: Math.max(
          8,
          Math.min(innerHeight - 60, origin.frame.top + moveEvent.clientY - origin.y)
        ),
      });
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  };

  const startResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const origin = { x: event.clientX, y: event.clientY, frame: current };
    const right = origin.frame.left + origin.frame.width;
    const move = (moveEvent: PointerEvent) => {
      const width = Math.max(
        MIN_WIDTH,
        Math.min(MAX_WIDTH, origin.frame.width - (moveEvent.clientX - origin.x))
      );
      const height = Math.max(
        MIN_HEIGHT,
        Math.min(
          innerHeight - origin.frame.top - 8,
          origin.frame.height + moveEvent.clientY - origin.y
        )
      );
      setFrame({ left: right - width, top: origin.frame.top, width, height });
    };
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  };

  return (
    <section
      ref={panelRef}
      aria-label={t("panel.name")}
      className="bg-surface shadow-float animate-tau-panel rounded-tau-lg fixed z-[35] flex flex-col overflow-hidden"
      style={current}
    >
      <header
        className="flex cursor-move items-center gap-2.5 py-3 pr-2.5 pl-3.5 select-none"
        onPointerDown={startDrag}
      >
        <SiteIcon />
        <div className="min-w-0 flex-1">
          <b className="text-tau-body-lg text-ink-1 block truncate font-semibold">
            {document.title || location.hostname}
          </b>
          <small className="text-tau-sm text-ink-3 flex items-center gap-1.5">
            <span className="truncate">{location.hostname}</span>
            <span className={cn("size-1.5 flex-none rounded-full", statusInfo.dot)} />
            <span className="flex-none">{statusInfo.label}</span>
          </small>
        </div>
        <IconButton
          aria-label={pinned ? t("panel.unpin") : t("panel.pinHint")}
          title={pinned ? t("panel.pinned") : t("panel.pin")}
          className={cn("size-7", pinned && "bg-accent-soft text-accent-text")}
          onClick={() => setPinned(value => !value)}
        >
          <Pin size={15} strokeWidth={1.8} />
        </IconButton>
        <div className="relative">
          <IconButton
            aria-label={t("panel.more")}
            className="size-7"
            onClick={() => setMenu(value => !value)}
          >
            <MoreHorizontal size={16} strokeWidth={1.8} />
          </IconButton>
          {menu && (
            <div
              role="menu"
              className="bg-surface shadow-float rounded-tau-md absolute top-9 right-0 z-10 min-w-[200px] p-1"
            >
              <MenuItem
                icon={Library}
                onClick={() => {
                  setMenu(false);
                  controller.openLibrary();
                }}
              >
                {t("panel.library")}
              </MenuItem>
              <MenuItem
                icon={EyeOff}
                onClick={() => {
                  setMenu(false);
                  controller.hideOnSite();
                }}
              >
                {t("panel.hide")}
              </MenuItem>
              <MenuItem
                icon={RotateCcw}
                onClick={() => {
                  setMenu(false);
                  setFrame(null);
                }}
              >
                {t("panel.reset")}
              </MenuItem>
            </div>
          )}
        </div>
        <IconButton
          aria-label={t("panel.close")}
          title={t("panel.closeEsc")}
          className="size-7"
          onClick={() => controller.closePanel()}
        >
          <X size={16} strokeWidth={1.8} />
        </IconButton>
      </header>
      <nav className="relative flex gap-[18px] px-4" aria-label={t("panel.tabs")}>
        {TABS.map(item => (
          <button
            key={item}
            type="button"
            aria-current={tab === item}
            onClick={() => controller.setTab(item)}
            className={cn(
              "relative inline-flex h-[34px] items-center gap-1 font-medium",
              tab === item ? "text-ink-1" : "text-ink-3 hover:text-ink-2"
            )}
          >
            {t(`tab.${item}`)}
            {item === "annotations" && count > 0 && (
              <span className="text-tau-micro text-ink-3 tabular-nums">
                {count.toLocaleString(locale)}
              </span>
            )}
            {tab === item && (
              <span className="bg-accent absolute inset-x-0 bottom-1 h-0.5 rounded-full" />
            )}
          </button>
        ))}
        {tab === "chat" && status === "ready" && <SessionNav />}
      </nav>
      <div className="flex min-h-0 flex-1 flex-col">
        {tab === "chat" && <ChatTab />}
        {tab === "annotations" && <AnnotationsTab />}
        {tab === "note" && <NoteTab />}
      </div>
      <div
        aria-hidden
        onPointerDown={startResize}
        className="after:border-ink-3 absolute bottom-0 left-0 size-[18px] cursor-nesw-resize after:absolute after:bottom-[5px] after:left-[5px] after:size-[7px] after:rounded-bl-[3px] after:border-b-[1.5px] after:border-l-[1.5px] after:opacity-60"
      />
    </section>
  );
}

function SiteIcon() {
  const [failed, setFailed] = useState(false);
  const icon = document.querySelector<HTMLLinkElement>("link[rel~='icon']")?.href;
  if (icon && !failed)
    return (
      <img
        src={icon}
        alt=""
        onError={() => setFailed(true)}
        className="size-7 flex-none rounded-lg object-contain"
      />
    );
  return (
    <span className="bg-ink-1 text-surface grid size-7 flex-none place-items-center rounded-lg font-serif text-sm font-bold">
      {(location.hostname[0] ?? "·").toUpperCase()}
    </span>
  );
}

function MenuItem({
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
      role="menuitem"
      onClick={onClick}
      className="text-ink-1 hover:bg-hover rounded-tau-sm flex h-[30px] w-full items-center gap-2 px-2 text-left"
    >
      <Icon size={15} strokeWidth={1.8} className="text-ink-2" />
      {children}
    </button>
  );
}
