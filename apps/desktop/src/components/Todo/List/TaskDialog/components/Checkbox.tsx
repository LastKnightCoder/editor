import { FC } from "react";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

const Checkbox: FC<CheckboxProps> = ({ checked, onChange, label }) => {
  return (
    <label className="group flex cursor-pointer items-center gap-3">
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <div
          className={`h-5 w-5 rounded border-2 transition-all duration-200 ${
            checked
              ? "border-[var(--th-accent)] bg-[var(--th-accent)]"
              : "border-gray-300 bg-gray-50 dark:border-slate-700 dark:bg-zinc-950"
          } group-hover:border-indigo-400 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 peer-focus-visible:ring-offset-2 dark:peer-focus-visible:ring-offset-slate-900`}
        >
          {checked && (
            <svg
              className="h-full w-full p-0.5 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
      </div>
      <span className="select-none text-sm text-gray-700 dark:text-slate-300">{label}</span>
    </label>
  );
};

export default Checkbox;
