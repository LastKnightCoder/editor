import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Code,
  RefreshCw,
  Sparkles,
  Square,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import { Button, Menu, Tooltip, cn } from "@tau/ui";
import type { QueryDefinition, QueryValue } from "@tau/shared/query-database";
import { formatAgo } from "@/utils/formatAgo";
import type { QueryAssistState } from "./useQueryAssist";

export type QueryStatusKind = "live" | "running" | "error" | "unsaved";

/** 标题行的状态胶囊：条数 / 更新时间合在一处，点它刷新 */
export function QueryStatusPill({
  kind,
  count,
  updatedAt,
  hasResult,
  onRefresh,
  compact,
  labelClassName,
}: {
  kind: QueryStatusKind;
  count?: number;
  updatedAt?: number;
  hasResult: boolean;
  onRefresh(): void;
  compact?: boolean;
  /** 窄宽度下收起文字，只留状态点与刷新图标 */
  labelClassName?: string;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick(value => value + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const ago = updatedAt ? formatAgo(updatedAt) : undefined;
  const text =
    kind === "running"
      ? hasResult
        ? "正在更新"
        : "正在查询…"
      : kind === "error"
        ? hasResult && ago
          ? `查询出错 · 显示${ago === "刚刚" ? "刚才" : ago}的结果`
          : "查询出错"
        : kind === "unsaved"
          ? "查询未保存"
          : compact
            ? `${count ?? 0} 条`
            : `${count ?? 0} 条${ago ? ` · ${ago === "刚刚" ? "刚刚更新" : `${ago}更新`}` : ""}`;
  return (
    <Tooltip content="立即刷新">
      <button
        type="button"
        aria-label={`${text}，立即刷新`}
        disabled={kind === "running"}
        onClick={onRefresh}
        className={cn(
          "text-tau-meta group/status ease-tau-out inline-flex h-7 shrink-0 items-center gap-[7px] rounded-full pr-1.5 pl-2.5 whitespace-nowrap tabular-nums transition-colors duration-[160ms]",
          "hover:bg-hover disabled:cursor-default",
          kind === "error"
            ? "text-danger"
            : kind === "unsaved"
              ? "text-warn"
              : "text-ink-3 hover:text-ink-2"
        )}
      >
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            kind === "live" && "bg-ok shadow-[0_0_0_3px_var(--tau-ok-soft)]",
            kind === "running" &&
              "bg-accent animate-pulse shadow-[0_0_0_3px_var(--tau-accent-soft)]",
            kind === "error" && "bg-danger shadow-[0_0_0_3px_var(--tau-danger-soft)]",
            kind === "unsaved" && "bg-warn shadow-[0_0_0_3px_var(--tau-warn-soft)]"
          )}
        />
        <span className={labelClassName}>{text}</span>
        <span className="grid size-[22px] place-items-center rounded-full">
          <RefreshCw
            className={cn("size-[13px]", kind === "running" && "animate-spin")}
            strokeWidth={1.75}
          />
        </span>
      </button>
    </Tooltip>
  );
}

export function QueryToggleButton({
  open,
  problem,
  onClick,
  small,
}: {
  open: boolean;
  problem: boolean;
  onClick(): void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onClick}
      className={cn(
        "ease-tau-out inline-flex shrink-0 items-center gap-1.5 rounded-[8px] transition-colors duration-[160ms]",
        small ? "text-tau-meta h-[26px] px-2.5" : "text-tau-meta h-[30px] px-3",
        open
          ? "bg-accent-soft text-accent-text font-medium"
          : "text-ink-2 hover:bg-hover hover:text-ink-1 shadow-[inset_0_0_0_1px_var(--tau-line-1)]"
      )}
    >
      <Code className="size-[13px]" strokeWidth={1.75} />
      查询
      {problem && <span className="bg-danger size-1.5 rounded-full" aria-label="查询有问题" />}
    </button>
  );
}

const LANGUAGE_LABEL: Record<QueryDefinition["language"], string> = {
  dsl: "查询语言",
  javascript: "JavaScript",
};

export function LanguageMenu({
  value,
  disabled,
  onChange,
}: {
  value: QueryDefinition["language"];
  disabled?: boolean;
  onChange(language: QueryDefinition["language"]): void;
}) {
  const trigger = (
    <button
      type="button"
      disabled={disabled}
      className="text-tau-meta text-ink-1 hover:bg-hover inline-flex h-[26px] items-center gap-1 rounded-[7px] px-2 font-medium disabled:cursor-default disabled:hover:bg-transparent"
    >
      {LANGUAGE_LABEL[value]}
      {!disabled && <ChevronDown className="text-ink-3 size-3" strokeWidth={2} />}
    </button>
  );
  if (disabled) return trigger;
  return (
    <Menu trigger={trigger} className="w-[180px]">
      {(["dsl", "javascript"] as const).map(language => (
        <Menu.Item
          key={language}
          onSelect={() => onChange(language)}
          icon={value === language ? <Check className="text-accent-text" /> : <span />}
        >
          {LANGUAGE_LABEL[language]}
        </Menu.Item>
      ))}
    </Menu>
  );
}

function formatParam(value: QueryValue | undefined) {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}
function parseParam(text: string): QueryValue {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (/^(true|false|null|-?\d+(\.\d+)?)$/.test(trimmed) || /^[[{"]/.test(trimmed)) {
    try {
      return JSON.parse(trimmed) as QueryValue;
    } catch {
      return text;
    }
  }
  return text;
}

/**
 * 参数胶囊：查询里引用到的参数自动出现，点值即改，回车或失焦生效。
 * 没有参数时不渲染；手动添加由外部菜单打开 adding。
 */
export function ParamChips({
  params,
  names,
  readOnly,
  adding,
  onAddingChange,
  onChange,
}: {
  params: Record<string, QueryValue>;
  names: string[];
  readOnly?: boolean;
  adding: boolean;
  onAddingChange(adding: boolean): void;
  onChange(params: Record<string, QueryValue>): void;
}) {
  const keys = [...new Set([...names, ...Object.keys(params)])];
  if (!keys.length && !adding) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {keys.map(key => (
        <ParamChip
          key={key}
          name={key}
          value={formatParam(params[key])}
          unused={!names.includes(key)}
          readOnly={readOnly}
          onCommit={text => onChange({ ...params, [key]: parseParam(text) })}
          onRemove={
            names.includes(key)
              ? undefined
              : () => {
                  const next = { ...params };
                  delete next[key];
                  onChange(next);
                }
          }
        />
      ))}
      {adding && !readOnly && (
        <input
          autoFocus
          aria-label="参数名"
          placeholder="参数名"
          className="text-tau-meta text-ink-1 h-6 w-24 rounded-[7px] px-2 font-mono shadow-[inset_0_0_0_1.5px_var(--tau-accent)] outline-none"
          onBlur={event => {
            const name = event.currentTarget.value.trim();
            if (/^[A-Za-z_]\w*$/.test(name) && !(name in params))
              onChange({ ...params, [name]: null });
            onAddingChange(false);
          }}
          onKeyDown={event => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") onAddingChange(false);
          }}
        />
      )}
    </div>
  );
}

function ParamChip({
  name,
  value,
  unused,
  readOnly,
  onCommit,
  onRemove,
}: {
  name: string;
  value: string;
  unused: boolean;
  readOnly?: boolean;
  onCommit(text: string): void;
  onRemove?(): void;
}) {
  const [draft, setDraft] = useState<string>();
  const editing = draft !== undefined;
  return (
    <span
      title={unused ? "查询里没有用到这个参数" : undefined}
      className={cn(
        "text-tau-meta inline-flex h-6 items-center overflow-hidden rounded-[7px] shadow-[inset_0_0_0_1px_var(--tau-line-1)]",
        unused && "opacity-60"
      )}
    >
      <span className="text-ink-3 px-[7px] font-mono text-[11.5px]">{name}</span>
      {editing ? (
        <input
          autoFocus
          aria-label={`参数 ${name}`}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onBlur={() => {
            if (draft !== value) onCommit(draft);
            setDraft(undefined);
          }}
          onKeyDown={event => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") setDraft(undefined);
          }}
          style={{ width: `${Math.max(4, draft.length + 1)}ch` }}
          className="text-ink-1 h-full max-w-60 rounded-r-[7px] px-2 shadow-[inset_0_0_0_1.5px_var(--tau-accent)] outline-none"
        />
      ) : (
        <button
          type="button"
          disabled={readOnly}
          onClick={() => setDraft(value)}
          className="text-ink-1 hover:bg-hover flex h-full max-w-60 min-w-9 items-center truncate px-2 shadow-[inset_1px_0_0_var(--tau-line-1)] disabled:cursor-default disabled:hover:bg-transparent"
        >
          {value || <span className="text-ink-3">空</span>}
        </button>
      )}
      {onRemove && !readOnly && (
        <button
          type="button"
          aria-label={`移除参数 ${name}`}
          onClick={onRemove}
          className="text-ink-3 hover:text-ink-1 grid h-full w-5 place-items-center"
        >
          <X className="size-3" strokeWidth={2} />
        </button>
      )}
    </span>
  );
}

export function ProblemBar({
  tone,
  position,
  message,
  children,
}: {
  tone: "danger" | "warn";
  position?: string;
  message: string;
  children?: ReactNode;
}) {
  const Icon = tone === "danger" ? AlertCircle : TriangleAlert;
  return (
    <div
      role="alert"
      className="border-line-2 text-tau-meta flex min-h-10 items-center gap-2 border-t px-3 py-1.5"
    >
      <Icon
        className={cn("size-[13px] shrink-0", tone === "danger" ? "text-danger" : "text-warn")}
        strokeWidth={1.75}
      />
      {position && <span className="text-ink-3 shrink-0 font-mono text-[11.5px]">{position}</span>}
      <span className="text-ink-1 min-w-0 flex-1 break-words">{message}</span>
      {children}
    </div>
  );
}

/** 源码面板底行：常驻的 AI 输入，按状态切换为进度、完成（可撤销）、冲突与失败 */
export function AssistRow({
  state,
  hasError,
  onSubmit,
  onStop,
  onUndo,
  onAccept,
  onDismiss,
  autoFocus,
  first,
}: {
  state: QueryAssistState;
  hasError: boolean;
  onSubmit(request: string): void;
  onStop(): void;
  onUndo(): void;
  onAccept(): void;
  onDismiss(): void;
  autoFocus?: boolean;
  first?: boolean;
}) {
  const [request, setRequest] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);
  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j" && input.current) {
        if (!input.current.closest("[data-query-panel]")?.contains(document.activeElement)) return;
        event.preventDefault();
        input.current.focus();
      }
    };
    document.addEventListener("keydown", focus);
    return () => document.removeEventListener("keydown", focus);
  }, []);
  const row = cn(
    "text-tau-meta flex min-h-[42px] items-center gap-2 py-1 pr-2 pl-3",
    !first && "border-line-2 border-t"
  );
  if (state.status === "busy")
    return (
      <div className={row}>
        <Sparkles className="text-accent-text size-[15px] shrink-0" strokeWidth={1.75} />
        <span className="text-ink-2 min-w-0 flex-1 truncate">{state.request}</span>
        <span className="text-accent-text inline-flex items-center gap-1.5">
          <i className="border-accent-soft border-t-accent size-3 animate-spin rounded-full border-[1.5px]" />
          正在编写
        </span>
        <Button size="sm" variant="ghost" icon={Square} onClick={onStop}>
          停止
        </Button>
      </div>
    );
  if (state.status === "done")
    return (
      <div className={cn(row, "bg-ok-soft rounded-b-[11px]")}>
        <Check className="text-ok size-[15px] shrink-0" strokeWidth={1.75} />
        <span className="text-ink-1 min-w-0 flex-1 truncate">已按「{state.request}」改写查询</span>
        <Button size="sm" variant="ghost" icon={Undo2} onClick={onUndo}>
          撤销
        </Button>
        <button
          type="button"
          aria-label="关闭"
          onClick={onDismiss}
          className="text-ink-3 hover:bg-hover hover:text-ink-1 grid size-7 place-items-center rounded-[8px]"
        >
          <X className="size-[13px]" strokeWidth={1.75} />
        </button>
      </div>
    );
  if (state.status === "conflict")
    return (
      <div className={cn(row, "bg-warn-soft rounded-b-[11px]")}>
        <TriangleAlert className="text-warn size-[15px] shrink-0" strokeWidth={1.75} />
        <span className="text-ink-1 min-w-0 flex-1">生成期间你改过查询，AI 的版本没有覆盖它</span>
        <Button size="sm" variant="soft" onClick={onAccept}>
          用 AI 的版本
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          丢弃
        </Button>
      </div>
    );
  return (
    <form
      className={row}
      onSubmit={event => {
        event.preventDefault();
        if (!request.trim()) return;
        onSubmit(request.trim());
        setRequest("");
      }}
    >
      <Sparkles className="text-accent-text size-[15px] shrink-0" strokeWidth={1.75} />
      <input
        ref={input}
        value={request}
        onChange={event => setRequest(event.target.value)}
        aria-label="查询需求"
        placeholder={
          state.status === "error"
            ? `AI 编写失败：${state.message}`
            : hasError
              ? "描述想看什么，或让 AI 修复上面的错误"
              : "描述想看什么，AI 帮你写查询。比如「按标签分组统计字数」"
        }
        className={cn(
          "text-ink-1 min-w-0 flex-1 bg-transparent outline-none",
          state.status === "error" ? "placeholder:text-danger" : "placeholder:text-ink-3"
        )}
      />
      {hasError && !request.trim() ? (
        <Button size="sm" variant="soft" icon={Sparkles} onClick={() => onSubmit("修复当前错误")}>
          让 AI 修复
        </Button>
      ) : (
        <span className="text-ink-3 rounded-[4px] px-1 font-mono text-[10.5px] shadow-[inset_0_0_0_1px_var(--tau-line-1)]">
          {request.trim() ? "↵" : "⌘ J"}
        </span>
      )}
    </form>
  );
}

export function Notice({
  tone,
  children,
  actions,
}: {
  tone: "danger" | "warn";
  children: ReactNode;
  actions?: ReactNode;
}) {
  const Icon = tone === "danger" ? AlertCircle : TriangleAlert;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className="text-tau-sm text-ink-1 flex shrink-0 items-center gap-2.5 rounded-[10px] py-2 pr-2.5 pl-3 shadow-[inset_0_0_0_1px_var(--tau-line-1)]"
    >
      <Icon
        className={cn("size-[15px] shrink-0", tone === "danger" ? "text-danger" : "text-warn")}
        strokeWidth={1.75}
      />
      <span className="min-w-0 flex-1">{children}</span>
      {actions}
    </div>
  );
}
