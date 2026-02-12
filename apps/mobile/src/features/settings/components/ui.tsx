import type { ReactNode } from "react";

export function IconChevronLeft() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function IconMoon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function IconCloud() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}

export function IconDatabase() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

export function IconFolder() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
    </svg>
  );
}

export function CheckMark() {
  return (
    <span className="text-blue-500">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}

export function FieldInput(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
  type?: string;
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
        props.checked ? "bg-blue-500" : "bg-gray-200 dark:bg-gray-700"
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
      className="mt-4 w-full rounded-lg bg-gray-900 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
    >
      {props.isSaving ? "保存中..." : (props.label ?? "保存配置")}
    </button>
  );
}
