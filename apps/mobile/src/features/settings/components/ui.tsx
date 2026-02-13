import type { ReactNode } from "react";
import {
  Check,
  CircleHelp,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Database,
  Folder,
  Moon,
} from "lucide-react";

export function IconChevronLeft() {
  return <ChevronLeft size={20} aria-hidden="true" />;
}

function IconChevronRight() {
  return <ChevronRight size={16} aria-hidden="true" />;
}

export function IconMoon() {
  return <Moon size={20} strokeWidth={1.8} aria-hidden="true" />;
}

export function IconCircleHelp() {
  return <CircleHelp size={20} strokeWidth={1.8} aria-hidden="true" />;
}

export function IconCloud() {
  return <Cloud size={20} strokeWidth={1.8} aria-hidden="true" />;
}

export function IconDatabase() {
  return <Database size={20} strokeWidth={1.8} aria-hidden="true" />;
}

export function IconFolder() {
  return <Folder size={20} strokeWidth={1.8} aria-hidden="true" />;
}

export function CheckMark() {
  return (
    <span className="text-gray-700 dark:text-neutral-200">
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
        <label className="mb-1.5 block text-sm text-gray-500 dark:text-gray-400">
          {props.label}
        </label>
      )}
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.currentTarget.value)}
        onBlur={props.onBlur}
        type={props.type ?? "text"}
        placeholder={props.placeholder}
        className="input-base w-full rounded-lg px-4 py-3 text-[15px] text-gray-900 placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
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
        <label className="mb-1.5 block text-sm text-gray-500 dark:text-gray-400">
          {props.label}
        </label>
      )}
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.currentTarget.value)}
        disabled={props.disabled}
        className="input-base w-full rounded-lg px-4 py-3 text-[15px] text-gray-900 disabled:opacity-60 dark:text-gray-100"
      >
        <option value="">{props.placeholder ?? "请选择"}</option>
        {props.options.map((option) => (
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
  const displayText = props.loading
    ? "加载中..."
    : props.value || props.placeholder || "请选择";
  const isPlaceholder = !props.loading && !props.value;

  return (
    <div>
      {props.label && (
        <label className="mb-1.5 block text-sm text-gray-500 dark:text-gray-400">
          {props.label}
        </label>
      )}
      <button
        type="button"
        onClick={props.onOpen}
        disabled={props.disabled}
        className="input-base flex min-h-[48px] w-full items-center justify-between rounded-lg px-4 py-3 text-left text-[15px] text-gray-900 transition-colors active:bg-gray-50 disabled:opacity-60 dark:text-gray-100 dark:active:bg-neutral-800"
      >
        <span
          className={
            isPlaceholder
              ? "text-gray-400 dark:text-gray-500"
              : "text-gray-900 dark:text-gray-100"
          }
        >
          {displayText}
        </span>
        <span className="text-gray-300 dark:text-gray-600">
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
      className="list-item w-full"
      disabled={!onClick}
    >
      <div className="flex items-center gap-3">
        <span className="text-gray-500 dark:text-gray-400">{icon}</span>
        <span className="text-[15px] text-gray-800 dark:text-gray-100">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {value && (
          <span className="text-sm text-gray-400 dark:text-gray-500">
            {value}
          </span>
        )}
        {showArrow && onClick && (
          <span className="text-gray-300 dark:text-gray-600">
            <IconChevronRight />
          </span>
        )}
      </div>
    </button>
  );
}

export function SwitchButton(props: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onChange}
      className={`relative h-7 w-12 rounded-full transition-colors ${
        props.checked
          ? "bg-gray-900 dark:bg-neutral-200"
          : "bg-gray-200 dark:bg-neutral-700"
      }`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
          props.checked ? "left-[22px]" : "left-0.5"
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
      className="mt-4 w-full rounded-lg bg-gray-900 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
    >
      {props.isSaving ? "保存中..." : (props.label ?? "保存配置")}
    </button>
  );
}
