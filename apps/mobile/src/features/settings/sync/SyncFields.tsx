// 同步服务面板的表单原语：分组内的行式字段，失焦即保存，不提供「保存」按钮。

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { LetterTile } from "../components/ui";

export function FieldGroup(props: { children: ReactNode }) {
  return <div className="setting-group">{props.children}</div>;
}

function FieldShell(props: { label: string; hint?: string; error?: boolean; children: ReactNode }) {
  return (
    <div className="setting-row flex-col items-stretch gap-0.5 py-2.5 [&::before]:left-[14px]">
      <span className={`text-[11.5px] ${props.error ? "text-danger" : "text-ink-3"}`}>
        {props.label}
      </span>
      {props.children}
      {props.hint && (
        <span className={`text-[11px] ${props.error ? "text-danger" : "text-ink-3"}`}>
          {props.hint}
        </span>
      )}
    </div>
  );
}

export function TextField(props: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  hint?: string;
  error?: boolean;
}) {
  return (
    <FieldShell label={props.label} hint={props.hint} error={props.error}>
      <input
        value={props.value}
        placeholder={props.placeholder}
        aria-label={props.label}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={event => props.onChange(event.currentTarget.value)}
        onBlur={props.onCommit}
        className="text-ink-1 placeholder:text-ink-3 min-h-[26px] w-full bg-transparent text-[15px] outline-none"
      />
    </FieldShell>
  );
}

export function PickerField(props: {
  label: string;
  value: string;
  placeholder: string;
  onOpen: () => void;
  disabled?: boolean;
  loading?: boolean;
  hint?: string;
  error?: boolean;
}) {
  const text = props.loading ? "加载中…" : props.value || props.placeholder;
  return (
    <FieldShell label={props.label} hint={props.hint} error={props.error}>
      <button
        type="button"
        onClick={props.onOpen}
        disabled={props.disabled}
        className="flex min-h-[26px] w-full items-center text-left text-[15px] disabled:opacity-50"
      >
        <span className={`flex-1 truncate ${props.value ? "text-ink-1" : "text-ink-3"}`}>
          {text}
        </span>
        <ChevronRight size={16} className="text-ink-3" aria-hidden="true" />
      </button>
    </FieldShell>
  );
}

/** 账号卡：凭证仍归集成账号管理（与资源存储共用），这里只就地展示与跳转更换 */
export function AccountCard(props: {
  letter: string;
  tileClassName: string;
  connected: boolean;
  title: string;
  description: string;
  onManage: () => void;
}) {
  return (
    <FieldGroup>
      <div className="setting-row">
        <LetterTile letter={props.letter} className={props.tileClassName} />
        <span className="min-w-0 flex-1">
          <span className="text-ink-1 block truncate text-[14.5px] font-semibold">
            {props.connected ? props.title : "未连接账号"}
          </span>
          <span className="text-ink-3 block truncate text-[11.5px]">{props.description}</span>
        </span>
        <button
          type="button"
          onClick={props.onManage}
          className="text-accent-text active:bg-hover h-8 shrink-0 rounded-full px-3 text-[13.5px] font-semibold"
        >
          {props.connected ? "更换" : "去连接"}
        </button>
      </div>
    </FieldGroup>
  );
}
