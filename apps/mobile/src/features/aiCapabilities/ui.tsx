// Skill 与 MCP 管理页共用的外壳与小件。行内标签固定 inline-flex + shrink-0，
// 与标题同排时不随父级变成整行块、不被截断挤压。

import { useRef, type ReactNode } from "react";
import { PortalScope, cn } from "@tau/ui";
import { PageHeader } from "../../components/PageHeader";
import { useEdgeFade } from "../../hooks/useScrollState";
import { useNavigator } from "../../router";

export function CapabilityPage(props: {
  title?: string;
  actions?: ReactNode;
  /** 有未保存修改时由页面接管返回 */
  onBack?: () => void;
  children: ReactNode;
}) {
  const navigator = useNavigator();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef);
  return (
    <PortalScope>
      <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
        <PageHeader
          title={props.title}
          onBack={props.onBack ?? (() => void navigator.goBack("ui"))}
          actions={props.actions}
        />
        <div
          ref={scrollRef}
          className="edge-fade-scroll mobile-page-scroll flex-1 overflow-y-auto px-4 pb-8"
        >
          <div className="page-enter space-y-1">{props.children}</div>
        </div>
      </div>
    </PortalScope>
  );
}

const TAG_TONES = {
  accent: "bg-accent-soft text-accent-text",
  sky: "bg-tag-2-soft text-tag-2",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  muted: "bg-page text-ink-3",
} as const;

export function Tag(props: { tone: keyof typeof TAG_TONES; children: ReactNode }) {
  return (
    <span
      className={cn(
        "text-tau-micro inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-[7px] py-px font-semibold",
        TAG_TONES[props.tone]
      )}
    >
      {props.children}
    </span>
  );
}

/** 标题行：名称可截断，标签跟在后面不换行 */
export function TitleLine(props: { title: ReactNode; tags?: ReactNode; mono?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        className={cn(
          "text-ink-1 min-w-0 truncate font-medium",
          props.mono ? "text-tau-sm font-mono" : "text-tau-body"
        )}
      >
        {props.title}
      </span>
      {props.tags}
    </span>
  );
}

const TILE_TONES = {
  accent: "bg-accent-soft text-accent-text",
  lilac: "bg-tag-3-soft text-tag-3",
  sky: "bg-tag-2-soft text-tag-2",
  rose: "bg-tag-5-soft text-tag-5",
  muted: "bg-page text-ink-2",
} as const;

export function Tile(props: {
  tone: keyof typeof TILE_TONES;
  children: ReactNode;
  large?: boolean;
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center",
        props.large ? "h-11 w-11 rounded-[14px]" : "h-[34px] w-[34px] rounded-xl",
        TILE_TONES[props.tone]
      )}
    >
      {props.children}
    </span>
  );
}

export function StatusText(props: { tone: "ok" | "wait" | "error" | "idle"; children: ReactNode }) {
  const dot = {
    ok: "bg-tag-1",
    wait: "bg-tag-4 pulse-soft",
    error: "bg-danger",
    idle: "bg-ink-3",
  }[props.tone];
  return (
    <span
      className={cn(
        "text-tau-sm flex min-w-0 items-center gap-1.5",
        props.tone === "error" ? "text-danger" : "text-ink-3"
      )}
    >
      <span className={cn("h-[7px] w-[7px] shrink-0 rounded-full", dot)} aria-hidden="true" />
      <span className="truncate">{props.children}</span>
    </span>
  );
}

export function Banner(props: {
  tone: "error" | "info" | "warn";
  icon: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  const tone = {
    error: "bg-danger-soft [&>svg]:text-danger",
    info: "bg-accent-soft [&>svg]:text-accent-text",
    warn: "bg-warn-soft [&>svg]:text-warn",
  }[props.tone];
  return (
    <div
      role={props.tone === "error" ? "alert" : undefined}
      className={cn("text-tau-sm mt-2 flex items-start gap-2.5 rounded-2xl px-3 py-2.5", tone)}
    >
      {props.icon}
      <span className="min-w-0 flex-1 leading-relaxed">
        <span className="text-ink-1 text-tau-body block font-semibold">{props.title}</span>
        {props.children && <span className="text-ink-2 block">{props.children}</span>}
      </span>
      {props.action && (
        <button
          type="button"
          className="text-accent-text shrink-0 self-center font-semibold"
          onClick={props.action.onClick}
        >
          {props.action.label}
        </button>
      )}
    </div>
  );
}

/** 筛选胶囊：手机触控尺寸，单选由调用方受控 */
export function Pill(props: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.active}
      onClick={props.onClick}
      className={cn(
        "text-tau-sm flex h-[30px] shrink-0 items-center gap-1 rounded-full px-3",
        props.active ? "bg-ink-1 text-ink-inverse font-semibold" : "bg-surface text-ink-2"
      )}
    >
      {props.label}
      <span className="tabular-nums opacity-60">{props.count}</span>
    </button>
  );
}
