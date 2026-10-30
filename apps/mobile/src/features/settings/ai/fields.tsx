// AI 服务商表单行：与存储服务表单同一形态（行即输入框、上标签下值）。

import { useState, type ReactNode } from "react";
import { ChevronRight, Eye, EyeOff } from "lucide-react";

const FIELD_ROW =
  "relative block px-[14px] py-2.5 [&+&]:before:absolute [&+&]:before:left-[14px] [&+&]:before:right-0 [&+&]:before:top-0 [&+&]:before:h-px [&+&]:before:bg-line-1";

function FieldLabel(props: { label: string; error?: string }) {
  return (
    <span className={`text-tau-sm block ${props.error ? "text-danger" : "text-ink-3"}`}>
      {props.label}
    </span>
  );
}

export function TextField(props: {
  label: string;
  value: string;
  placeholder?: string;
  error?: string;
  hint?: string;
  secret?: boolean;
  inputMode?: "url" | "numeric" | "text";
  disabled?: boolean;
  trailing?: ReactNode;
  onChange(value: string): void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className={FIELD_ROW}>
      <FieldLabel label={props.label} error={props.error} />
      <span className="flex min-h-[28px] items-center gap-2">
        <input
          aria-label={props.label}
          aria-invalid={!!props.error || undefined}
          value={props.value}
          type={props.secret && !visible ? "password" : "text"}
          inputMode={props.inputMode}
          placeholder={props.placeholder}
          disabled={props.disabled}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          className="input-text text-ink-1 placeholder:text-ink-3 min-w-0 flex-1 bg-transparent outline-none"
          onChange={event => props.onChange(event.currentTarget.value)}
        />
        {props.secret && (
          <button
            type="button"
            aria-label={visible ? "隐藏" : "显示"}
            className="text-ink-3 -mr-1 grid h-8 w-8 place-items-center"
            onClick={event => {
              event.preventDefault();
              setVisible(value => !value);
            }}
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
        {props.trailing}
      </span>
      {(props.error || props.hint) && (
        <span className={`text-tau-sm mt-0.5 block ${props.error ? "text-danger" : "text-ink-3"}`}>
          {props.error || props.hint}
        </span>
      )}
    </label>
  );
}

export function ChoiceField(props: {
  label: string;
  value: string;
  disabled?: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className={`${FIELD_ROW} active:bg-hover w-full text-left`}
    >
      <FieldLabel label={props.label} />
      <span className="flex min-h-[28px] items-center gap-2">
        <span className="text-ink-1 text-tau-body min-w-0 flex-1 truncate">{props.value}</span>
        <ChevronRight size={18} className="text-ink-3 shrink-0" aria-hidden="true" />
      </span>
    </button>
  );
}
