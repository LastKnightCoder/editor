import type { ReactNode } from "react";
import {
  Check,
  CircleHelp,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Database,
  Folder,
  Image as ImageIcon,
  Info,
  KeyRound,
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

export function IconChevronLeft() {
  return <ChevronLeft size={20} aria-hidden="true" />;
}

export function IconChevronRight() {
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

export function IconUsers() {
  return (
    <IconTile className="bg-accent-soft text-accent">
      <Users size={17} strokeWidth={1.9} aria-hidden="true" />
    </IconTile>
  );
}

export function CheckMark() {
  return (
    <span className="text-accent">
      <Check size={20} strokeWidth={2.5} aria-hidden="true" />
    </span>
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
        className="input-base text-ink-1 w-full px-4 py-3 text-[14px]"
      />
    </div>
  );
}

export function FieldSelect(props: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      {props.label && (
        <label className="text-ink-2 mb-1.5 block text-[13px] font-medium">{props.label}</label>
      )}
      <select
        value={props.value}
        onChange={e => props.onChange(e.currentTarget.value)}
        disabled={props.disabled}
        className="input-base text-ink-1 w-full px-4 py-3 text-[14px] disabled:opacity-60"
      >
        <option value="">{props.placeholder ?? "请选择"}</option>
        {props.options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FieldSheetTrigger(props: {
  value: string;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  loading?: boolean;
  onOpen: () => void;
}) {
  const displayText = props.loading ? "加载中..." : props.value || props.placeholder || "请选择";
  const isPlaceholder = !props.loading && !props.value;

  return (
    <div>
      {props.label && (
        <label className="text-ink-2 mb-1.5 block text-[13px] font-medium">{props.label}</label>
      )}
      <button
        type="button"
        onClick={props.onOpen}
        disabled={props.disabled}
        className="input-base active:bg-hover flex min-h-[48px] w-full items-center justify-between px-4 py-3 text-left text-[14px] transition-colors disabled:opacity-60"
      >
        <span className={isPlaceholder ? "text-ink-3" : "text-ink-1"}>{displayText}</span>
        <span className="text-ink-3">
          <IconChevronRight />
        </span>
      </button>
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

export function SaveButton(props: {
  isSaving: boolean;
  onClick: () => Promise<void>;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => void props.onClick()}
      disabled={props.isSaving}
      className="bg-accent shadow-lift text-ink-inverse mt-4 w-full rounded-full py-3 text-sm font-bold transition-transform duration-150 active:scale-[0.97] disabled:opacity-50"
      style={{ background: "var(--tau-accent)" }}
    >
      {props.isSaving ? "保存中..." : (props.label ?? "保存配置")}
    </button>
  );
}

/* ══ 方案 C 极简分组原语：组标签 / 组卡片 / 行 / 状态点 / 单选气泡 / ⓘ ── */

/* 分组标签见 components/GroupLabel：设置页滚动容器自带 px-4，用默认 inset="settings" 即可 */

/** 分组下方的说明文字，缩进与 GroupLabel(settings) 一致：容器 16px + 卡片 1px 边框 + 行内 14px */
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

export function InfoDotButton(props: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={event => {
        event.stopPropagation();
        props.onClick();
      }}
      aria-label={props.label}
      className="bg-page text-ink-2 grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full transition-transform duration-150 active:scale-90"
    >
      <Info size={14} strokeWidth={2.2} aria-hidden="true" />
    </button>
  );
}

/** 详情页操作组内的文字按钮行（主色 / 危险色） */
export function GroupActionRow(props: {
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={`setting-row justify-center gap-2 text-[14.5px] font-semibold disabled:opacity-50 ${
        props.danger ? "text-danger" : "text-accent"
      }`}
    >
      {props.children}
    </button>
  );
}

/** 配置子页顶部凭证入口行：显示连接状态并跳转集成账号 */
export function CredentialEntryRow(props: {
  connected: boolean;
  account?: string;
  onOpen: () => void;
}) {
  return (
    <GroupRow onClick={props.onOpen}>
      <IconTile className={props.connected ? "bg-tag-1-soft text-tag-1" : "bg-page text-ink-2"}>
        {props.connected ? (
          <Check size={16} strokeWidth={2.2} aria-hidden="true" />
        ) : (
          <KeyRound size={16} strokeWidth={1.9} aria-hidden="true" />
        )}
      </IconTile>
      <span className="min-w-0 flex-1">
        <span className="text-ink-1 block truncate text-[14px] font-medium">
          {props.connected ? `已连接${props.account ? ` · ${props.account}` : ""}` : "未连接凭证"}
        </span>
        <span className="text-ink-3 block text-[11.5px]">
          {props.connected ? "凭证已验证，可正常同步" : "点击前往集成账号完成连接"}
        </span>
      </span>
      <span className="text-ink-3">
        <IconChevronRight />
      </span>
    </GroupRow>
  );
}
