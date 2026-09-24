import { cn } from "@tau/ui";
import { type ReactNode } from "react";

type OptionState = "idle" | "sel" | "right" | "wrong" | "dim";

export function OptionButton({
  letter,
  state,
  square,
  center,
  disabled,
  note,
  onClick,
  children,
}: {
  letter: string;
  state: OptionState;
  square?: boolean;
  center?: boolean;
  disabled: boolean;
  note?: string;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "ease-tau-out flex min-h-11 w-full items-center gap-3 rounded-[12px] border px-3.5 py-[9px] text-left text-[14px] outline-none transition-[background,border-color] duration-150 focus-visible:shadow-[var(--tau-focus-ring)] disabled:cursor-default",
        center && "min-h-[50px] justify-center font-medium",
        state === "idle" && "border-line-1 hover:bg-hover",
        state === "sel" && "border-accent bg-accent-soft",
        state === "right" && "bg-ok-soft border-transparent",
        state === "wrong" && "bg-danger-soft border-transparent",
        state === "dim" && "border-line-1 opacity-55"
      )}
    >
      <span
        className={cn(
          "grid size-[22px] shrink-0 place-items-center font-mono text-[11px] font-semibold",
          square ? "rounded-[6px]" : "rounded-full",
          state === "sel" && "bg-accent text-ink-inverse",
          state === "right" && "bg-ok text-ink-inverse",
          state === "wrong" && "bg-danger text-ink-inverse",
          (state === "idle" || state === "dim") && "bg-hover text-ink-2"
        )}
      >
        {letter}
      </span>
      <span>{children}</span>
      {note && <span className="text-ink-2 ml-auto pl-3 text-right text-[12px]">{note}</span>}
    </button>
  );
}
