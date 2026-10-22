// 协作 UI 原语：头像 / 头像堆叠 / 状态点 / 状态徽标 / 协作码卡 / 成员行。
// 成员色统一由 memberColor(deviceId) 派生，保证头像、光标、名牌同色。
import type { ReactNode } from "react";
import { Check, Copy, RefreshCw, UserMinus } from "lucide-react";
import type { Member } from "@tau/collaboration";
import { memberColor } from "@tau/collaboration/src/palette";
import type { SessionTone } from "../session-status";

export function avatarInitial(name?: string) {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "?";
  return [...trimmed][0].toUpperCase();
}

export function Avatar(props: {
  id: string;
  name?: string;
  size?: "sm" | "md" | "lg";
  online?: boolean;
  dimmed?: boolean;
  className?: string;
}) {
  const sizeClass =
    props.size === "sm"
      ? "h-[26px] w-[26px] text-[11.5px]"
      : props.size === "lg"
        ? "h-[46px] w-[46px] text-[19px]"
        : "h-[34px] w-[34px] text-[14px]";
  const dotClass = props.size === "sm" ? "h-[9px] w-[9px]" : "h-[10px] w-[10px]";
  return (
    <span
      className={`relative grid shrink-0 place-items-center rounded-full font-extrabold text-white ${sizeClass} ${props.dimmed ? "opacity-50" : ""} ${props.className ?? ""}`}
      style={{ background: memberColor(props.id) }}
      aria-hidden="true"
    >
      {avatarInitial(props.name)}
      {props.online ? (
        <span
          className={`border-surface bg-tag-1 absolute -bottom-px -right-px rounded-full border-[2.5px] ${dotClass}`}
        />
      ) : null}
    </span>
  );
}

export function AvatarStack(props: { members: Member[]; max?: number; className?: string }) {
  const max = props.max ?? 3;
  const visible = props.members.slice(0, max);
  const rest = props.members.length - visible.length;
  return (
    <span className={`flex ${props.className ?? ""}`}>
      {visible.map(member => (
        <Avatar
          key={member.deviceId}
          id={member.deviceId}
          name={member.nickname}
          size="sm"
          className="border-page -ml-[9px] border-[2.5px] first:ml-0"
        />
      ))}
      {rest > 0 ? (
        <span className="border-page bg-page text-ink-2 -ml-[9px] grid h-[26px] w-[26px] place-items-center rounded-full border-[2.5px] text-[10.5px] font-extrabold">
          +{rest}
        </span>
      ) : null}
    </span>
  );
}

const TONE_DOT: Record<SessionTone, string> = {
  live: "bg-tag-1",
  syncing: "bg-tag-2 pulse-soft",
  offline: "bg-ink-3",
  error: "bg-tag-5",
  idle: "bg-ink-3",
};

export function StatusDot(props: { tone: SessionTone; className?: string }) {
  return (
    <span
      className={`inline-block h-[9px] w-[9px] shrink-0 rounded-full ${TONE_DOT[props.tone]} ${props.className ?? ""}`}
      aria-hidden="true"
    />
  );
}

const TONE_BADGE: Record<SessionTone, string> = {
  live: "bg-tag-1-soft text-tag-1",
  syncing: "bg-tag-2-soft text-tag-2",
  offline: "bg-page text-ink-3",
  error: "bg-tag-5-soft text-tag-5",
  idle: "bg-page text-ink-3",
};

export function StatusBadge(props: { tone: SessionTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${TONE_BADGE[props.tone]}`}
    >
      <StatusDot tone={props.tone} />
      {props.children}
    </span>
  );
}

/** 成员活动文案：作者显示徽章，其余按在线活动展示 */
export function memberActivity(member: Member) {
  if (member.role === "owner") return "作者";
  if (!member.online) return "离线";
  if (member.activity === "editing") return "编辑中";
  if (member.activity === "viewing") return "查看中";
  return "在线";
}

export function memberActivityClass(member: Member) {
  if (member.role === "owner") return "bg-accent-soft text-accent";
  if (!member.online) return "bg-page text-ink-3";
  if (member.activity === "editing") return "bg-tag-1-soft text-tag-1";
  if (member.activity === "viewing") return "bg-tag-2-soft text-tag-2";
  return "bg-page text-ink-2";
}

export function MemberRow(props: {
  member: Member;
  selfId?: string;
  onRemove?: (member: Member) => void;
  removeDisabled?: boolean;
}) {
  const { member } = props;
  const isSelf = Boolean(props.selfId && member.deviceId === props.selfId);
  return (
    <div className="relative flex items-center gap-3 px-3.5 py-2.5">
      <Avatar
        id={member.deviceId}
        name={member.nickname}
        online={member.online}
        dimmed={!member.online}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={`truncate text-[14px] font-semibold ${member.online ? "text-ink-1" : "text-ink-2"}`}
          >
            {member.nickname}
          </span>
          {isSelf ? <span className="text-ink-3 text-[11px] font-medium">（你）</span> : null}
        </div>
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-[3px] text-[11px] font-bold ${memberActivityClass(member)}`}
      >
        {memberActivity(member)}
      </span>
      {props.onRemove && member.role !== "owner" && !isSelf ? (
        <button
          type="button"
          aria-label={`移除 ${member.nickname}`}
          disabled={props.removeDisabled}
          onClick={() => props.onRemove?.(member)}
          className="text-tag-5/75 active:bg-tag-5-soft grid h-8 w-8 place-items-center rounded-full disabled:opacity-40"
        >
          <UserMinus size={15} />
        </button>
      ) : null}
    </div>
  );
}

/** 协作码展示：12 位按 4-4-4 分组，与服务端字符集一致 */
export function CollabCodeCard(props: {
  code?: string;
  expiresAt?: number;
  busy?: boolean;
  onCopy?: () => void;
  onRotate?: () => void;
}) {
  const code = props.code;
  const groups = code ? [code.slice(0, 4), code.slice(4, 8), code.slice(8, 12)] : undefined;
  const remainDays = props.expiresAt
    ? Math.max(1, Math.ceil((props.expiresAt - Date.now()) / 86_400_000))
    : undefined;
  return (
    <div className="bg-surface shadow-card rounded-[20px] p-4">
      <div className="mb-2.5 flex items-center">
        <span className="text-ink-2 flex-1 text-[12px] font-bold tracking-[0.06em]">
          协作码 · 分享给伙伴加入
        </span>
        <span className="text-ink-3 text-[11px]">
          {remainDays ? `${remainDays} 天后过期` : "7 天有效"}
        </span>
      </div>
      <div className="text-ink-1 flex justify-center gap-2 font-mono text-[21px] font-extrabold tracking-[0.04em]">
        {groups ? (
          <>
            <span>{groups[0]}</span>
            <span className="text-ink-3">·</span>
            <span>{groups[1]}</span>
            <span className="text-ink-3">·</span>
            <span>{groups[2]}</span>
          </>
        ) : (
          <span className="text-ink-3">———— · ———— · ————</span>
        )}
      </div>
      <div className="mt-3.5 flex gap-2.5">
        {code ? (
          <button
            type="button"
            onClick={props.onCopy}
            className="shadow-lift text-ink-inverse flex flex-[1.6] items-center justify-center gap-2 rounded-full py-3 text-[13.5px] font-extrabold active:scale-[0.98]"
            style={{ background: "var(--tau-accent)" }}
          >
            <Copy size={16} /> 复制协作码
          </button>
        ) : (
          <button
            type="button"
            disabled={props.busy}
            onClick={props.onRotate}
            className="shadow-lift text-ink-inverse flex flex-[1.6] items-center justify-center gap-2 rounded-full py-3 text-[13.5px] font-extrabold disabled:opacity-50"
            style={{ background: "var(--tau-accent)" }}
          >
            <Check size={16} /> 生成协作码
          </button>
        )}
        {code ? (
          <button
            type="button"
            disabled={props.busy}
            onClick={props.onRotate}
            className="bg-page text-ink-2 flex flex-1 items-center justify-center gap-1.5 rounded-full py-3 text-[13px] font-bold disabled:opacity-50"
          >
            <RefreshCw size={15} /> 轮换
          </button>
        ) : null}
      </div>
      <p className="text-ink-3 mt-2.5 text-center text-[10.5px]">
        轮换后旧码立即失效 · 新码 7 天有效 · 成员上限 10 人
      </p>
    </div>
  );
}
