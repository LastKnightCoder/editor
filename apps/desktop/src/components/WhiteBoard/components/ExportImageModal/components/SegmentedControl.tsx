export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string | number> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}

function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  disabled = false,
  className = "",
}: SegmentedControlProps<T>) {
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-xl bg-gray-100 p-1 dark:bg-zinc-800 ${
        disabled ? "cursor-not-allowed opacity-60" : ""
      } ${className}`}
    >
      {options.map(option => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onChange(option.value)}
            className={`cursor-pointer whitespace-nowrap rounded-lg border-none px-3.5 py-1.5 text-sm font-medium transition-all ${
              selected
                ? "bg-white text-[var(--th-active-text)] shadow-sm dark:bg-zinc-700"
                : "bg-transparent text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200"
            } disabled:cursor-not-allowed`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
