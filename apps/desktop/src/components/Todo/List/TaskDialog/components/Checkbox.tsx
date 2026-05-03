import { FC } from "react";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

const Checkbox: FC<CheckboxProps> = ({ checked, onChange, label }) => {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div
          className={`
            w-5 h-5 rounded border-2 transition-all duration-200
            ${
              checked
                ? "bg-indigo-500 border-indigo-500"
                : "bg-gray-50 dark:bg-zinc-950 border-gray-300 dark:border-slate-700"
            }
            peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 peer-focus-visible:ring-offset-2 dark:peer-focus-visible:ring-offset-slate-900
            group-hover:border-indigo-400
          `}
        >
          {checked && (
            <svg
              className="w-full h-full text-white p-0.5"
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
      <span className="text-sm select-none text-gray-700 dark:text-slate-300">
        {label}
      </span>
    </label>
  );
};

export default Checkbox;
