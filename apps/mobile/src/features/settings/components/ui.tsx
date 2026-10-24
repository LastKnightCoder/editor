import type { ReactNode } from "react";
import {
  BookOpen,
  Check,
  CircleHelp,
  ChevronRight,
  Cloud,
  Database,
  Folder,
  Image as ImageIcon,
  Moon,
  Users,
  Wifi,
} from "lucide-react";

// 图标统一为「彩色圆角块」形态（34px 方块 + soft 底色）
function IconTile({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl ${className}`}>
      {children}
    </span>
  );
}

function IconChevronRight() {
  return <ChevronRight size={16} aria-hidden="true" />;
}

export function IconMoon() {
  return (
    <IconTile className="bg-tag-5-soft text-tag-5">
      <Moon size={17} strokeWidth={1.9} aria-hidden="true" />
    </IconTile>
  );
}

export function IconCircleHelp() {
  return (
    <IconTile className="bg-page text-ink-2">
      <CircleHelp size={17} strokeWidth={1.9} aria-hidden="true" />
    </IconTile>
  );
}

export function IconCloud() {
  return (
    <IconTile className="bg-tag-2-soft text-tag-2">
      <Cloud size={17} strokeWidth={1.9} aria-hidden="true" />
    </IconTile>
  );
}

export function IconDatabase() {
  return (
    <IconTile className="bg-tag-3-soft text-tag-3">
      <Database size={17} strokeWidth={1.9} aria-hidden="true" />
    </IconTile>
  );
}

export function IconFolder() {
  return (
    <IconTile className="bg-tag-4-soft text-tag-4">
      <Folder size={17} strokeWidth={1.9} aria-hidden="true" />
    </IconTile>
  );
}

export function IconImage() {
  return (
    <IconTile className="bg-tag-1-soft text-tag-1">
      <ImageIcon size={17} strokeWidth={1.9} aria-hidden="true" />
    </IconTile>
  );
}

export function IconWifi() {
  return (
    <IconTile className="bg-tag-1-soft text-tag-1">
      <Wifi size={17} strokeWidth={1.9} aria-hidden="true" />
    </IconTile>
  );
}

export function IconBookOpen() {
  return (
    <IconTile className="bg-tag-4-soft text-tag-4">
      <BookOpen size={17} strokeWidth={1.9} aria-hidden="true" />
    </IconTile>
  );
}

export function IconUsers() {
  return (
    <IconTile className="bg-accent-soft text-accent">
      <Users size={17} strokeWidth={1.9} aria-hidden="true" />
    </IconTile>
  );
}

export function FieldInput(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
  type?: string;
  onBlur?: () => void;
}) {
  return (
    <div>
      {props.label && (
        <label className="text-ink-2 mb-1.5 block text-[13px] font-medium">{props.label}</label>
      )}
      <input
        value={props.value}
        onChange={e => props.onChange(e.currentTarget.value)}
        onBlur={props.onBlur}
        type={props.type ?? "text"}
        placeholder={props.placeholder}
        className="input-base w-full px-4 py-3"
      />
    </div>
  );
}

export function ListItem({
  icon,
  label,
  value,
  onClick,
  showArrow = true,
}: {
  icon: ReactNode;
  label: string;
  value?: string;
  onClick?: () => void;
  showArrow?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="list-item w-full gap-3 text-left"
      disabled={!onClick}
    >
      {icon}
      <span className="text-ink-1 flex-1 text-[14px] font-medium">{label}</span>
      <span className="flex items-center gap-1.5">
        {value && <span className="text-ink-3 text-[12.5px]">{value}</span>}
        {showArrow && onClick && (
          <span className="text-ink-3">
            <IconChevronRight />
          </span>
        )}
      </span>
    </button>
  );
}

export function SwitchButton(props: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onChange}
      role="switch"
      aria-checked={props.checked}
      className={`relative h-7 w-[46px] rounded-full transition-colors duration-200 ${
        props.checked ? "bg-tag-1" : "bg-line-1"
      }`}
    >
      <span
        className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-[0_2px_5px_rgba(0,0,0,0.18)] transition-[left] duration-200 ${
          props.checked ? "left-[21px]" : "left-[3px]"
        }`}
      />
    </button>
  );
}

export function GroupNote(props: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-ink-3 px-[15px] text-[11.5px] leading-relaxed ${props.className ?? ""}`}>
      {props.children}
    </p>
  );
}

export function GroupCard(props: { children: ReactNode }) {
  return <div className="setting-group">{props.children}</div>;
}

export function GroupRow(props: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const className = `setting-row ${props.className ?? ""}`;
  if (!props.onClick) {
    return <div className={className}>{props.children}</div>;
  }
  // 行内可能嵌 ⓘ 等真实 button，行本体用 div[role=button] 避免非法 button 嵌套
  return (
    <div
      role="button"
      tabIndex={props.disabled ? -1 : 0}
      aria-disabled={props.disabled || undefined}
      onClick={props.disabled ? undefined : props.onClick}
      onKeyDown={event => {
        if (props.disabled) {
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onClick?.();
        }
      }}
      className={className}
    >
      {props.children}
    </div>
  );
}

export function StatusDot(props: { tone: "ok" | "run" | "warn" | "idle" }) {
  const toneClass = {
    ok: "bg-tag-1",
    run: "bg-tag-2 pulse-soft",
    warn: "bg-tag-4",
    idle: "bg-ink-3",
  }[props.tone];
  return (
    <span className={`h-[9px] w-[9px] shrink-0 rounded-full ${toneClass}`} aria-hidden="true" />
  );
}

export function CheckBubble() {
  return (
    <span className="bg-accent text-ink-inverse grid h-[21px] w-[21px] shrink-0 place-items-center rounded-full">
      <Check size={13} strokeWidth={3.4} aria-hidden="true" />
    </span>
  );
}

export function LetterTile(props: { letter: string; className: string }) {
  return (
    <IconTile className={props.className}>
      <span className="text-[14px] font-extrabold">{props.letter}</span>
    </IconTile>
  );
}
