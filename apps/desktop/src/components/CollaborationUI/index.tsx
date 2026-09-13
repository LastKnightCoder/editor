import { memo, type ButtonHTMLAttributes, type CSSProperties } from "react";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Tooltip } from "antd";
import { memberColor, type CollaborationSession, type Member } from "@tau/collaboration";

export function memberActivity(member: Member): string {
  if (!member.online) return "离线";
  if (member.activity === "editing") return "正在编辑";
  if (member.activity === "viewing") return "正在查看";
  return "后台";
}

export function editingMemberCount(session: CollaborationSession): number {
  return new Set(
    session.members
      .filter(member => member.online && member.activity === "editing")
      .map(member => member.deviceId)
  ).size;
}

export const Avatar = memo(function Avatar({
  id,
  name,
  online,
  size = 22,
  style,
}: {
  id: string;
  name: string;
  online?: boolean;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <span className="relative inline-flex flex-none" style={style} title={name}>
      <span
        className="inline-flex select-none items-center justify-center rounded-full font-semibold leading-none text-white"
        style={{
          width: size,
          height: size,
          fontSize: Math.max(10, size * 0.45),
          background: memberColor(id),
          boxShadow:
            "inset 0 1px 1px rgba(255, 255, 255, 0.22), inset 0 -1px 2px rgba(0, 0, 0, 0.14)",
        }}
      >
        {(name || "?").trim().slice(0, 1).toUpperCase()}
      </span>
      {online !== undefined && (
        <i
          className={`absolute bottom-[-1px] right-[-1px] h-[7px] w-[7px] rounded-full shadow-[0_0_0_2px_var(--th-card-bg)] ${
            online ? "bg-status-success" : "bg-[var(--th-text-tertiary)]"
          }`}
          aria-label={online ? "在线" : "离线"}
        />
      )}
    </span>
  );
});

/** 头像堆叠：最多展示 max 枚，超出部分收敛为计数胶囊。 */
export const AvatarStack = memo(function AvatarStack({
  members,
  max = 3,
  size = 20,
}: {
  members: { deviceId: string; nickname: string; online?: boolean }[];
  max?: number;
  size?: number;
}) {
  const shown = members.slice(0, max);
  const rest = members.length - shown.length;
  return (
    <span className="flex flex-none items-center">
      {shown.map(member => (
        <span
          key={member.deviceId}
          className="-mr-1.5 flex rounded-full outline-2 outline-[var(--th-card-bg)] last:mr-0"
        >
          <Avatar id={member.deviceId} name={member.nickname} size={size} online={member.online} />
        </span>
      ))}
      {rest > 0 && (
        <span className="bg-tag-bg text-text-3 ml-2.5 inline-flex items-center rounded-full px-1.5 text-[10px] font-medium leading-4">
          +{rest}
        </span>
      )}
    </span>
  );
});

export type StatusTone = "live" | "syncing" | "offline" | "error" | "idle";

const DOT_TONES: Record<StatusTone, string> = {
  live: "bg-status-success animate-collab-pulse motion-reduce:animate-none",
  syncing: "bg-status-warning",
  offline: "bg-[var(--th-text-tertiary)]",
  error: "bg-status-error",
  idle: "bg-[var(--th-text-tertiary)]",
};

export function StatusDot({ tone = "idle" }: { tone?: StatusTone }) {
  return <i className={`inline-block h-2 w-2 flex-none rounded-full ${DOT_TONES[tone]}`} />;
}

const BADGE_TONES: Record<StatusTone, string> = {
  live: "bg-[color-mix(in_oklab,var(--th-success)_12%,transparent)] text-status-success",
  syncing: "bg-[color-mix(in_oklab,var(--th-warning)_14%,transparent)] text-status-warning",
  offline: "bg-tag-bg text-text-2",
  error: "bg-[color-mix(in_oklab,var(--th-danger)_12%,transparent)] text-status-error",
  idle: "bg-tag-bg text-text-2",
};

/** 状态徽标：小圆点 + 文本，用于列表与工具栏。 */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs leading-[18px] ${BADGE_TONES[tone]}`}
    >
      <i className="h-1.5 w-1.5 flex-none rounded-full bg-current" />
      {children}
    </span>
  );
}

export const IconButton = memo(function IconButton({
  label,
  danger,
  tone,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  danger?: boolean;
  /** hover 高亮语义色，danger 为红色、success 为绿色。 */
  tone?: "default" | "danger" | "success";
}) {
  const hoverTone =
    danger || tone === "danger"
      ? "text-text-2 hover:bg-[color-mix(in_oklab,var(--th-danger)_12%,transparent)] hover:text-status-error"
      : tone === "success"
        ? "text-text-2 hover:bg-[color-mix(in_oklab,var(--th-success)_14%,transparent)] hover:text-status-success"
        : "text-text-2 hover:bg-hover hover:text-text-1";
  return (
    <Tooltip title={label} mouseEnterDelay={0.2}>
      {/* span 包装让 disabled 状态下 Tooltip 仍可显示 */}
      <span className="inline-flex">
        <button
          type="button"
          aria-label={label}
          className={`inline-flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-[7px] bg-transparent transition duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--th-border-focus)] active:scale-95 disabled:cursor-default disabled:opacity-45 ${hoverTone} ${className ?? ""}`}
          {...props}
        >
          {children}
        </button>
      </span>
    </Tooltip>
  );
});

export function CopyButton({
  value,
  label = "复制",
  variant = "icon",
  onCopied,
}: {
  value: string | (() => string | undefined | Promise<string | undefined>);
  label?: string;
  /** icon 为纯图标按钮，solid 为带文案的主按钮。 */
  variant?: "icon" | "solid";
  onCopied?: (code: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const code = typeof value === "function" ? await value() : value;
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    onCopied?.(code);
  };
  if (variant === "solid") {
    return (
      <button
        type="button"
        onClick={copy}
        className="bg-brand hover:bg-brand-hover inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-white transition duration-150 ease-out active:scale-95"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? "已复制" : "复制"}
      </button>
    );
  }
  return (
    <IconButton label={label} onClick={copy}>
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </IconButton>
  );
}
