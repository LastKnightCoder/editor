import { CODE_BLOCK_LANGUAGE_OPTIONS, normalizeCodeBlockLanguageDisplayName } from "@tau/shared";
import { For } from "@tau/shared";
import React, { useState } from "react";
import { Popover, cn } from "@tau/ui";
import { ChevronDown } from "lucide-react";

interface SelectLanguageProps {
  value: string;
  onChange: (value: string) => void;
  style?: React.CSSProperties;
  className?: string;
  readonly?: boolean;
}

const SelectLanguage = (props: SelectLanguageProps) => {
  const { value, onChange, className, style = {}, readonly } = props;

  const [open, setOpen] = useState(false);
  const normalizedValue = normalizeCodeBlockLanguageDisplayName(value);

  return (
    <Popover
      placement="bottom"
      open={!readonly && open}
      onOpenChange={open => {
        if (readonly) {
          setOpen(false);
          return;
        }
        setOpen(open);
      }}
      arrow={false}
      className="p-1"
      trigger={
        <button
          type="button"
          style={style}
          className={cn(
            "inline-flex h-[1.75em] shrink-0 items-center gap-[0.25em] rounded-[0.375em] px-[0.5em] text-[0.75em] font-medium text-[var(--ed-text-secondary)]",
            readonly
              ? "cursor-default"
              : "cursor-pointer transition-colors duration-150 hover:bg-[var(--ed-bg-hover)] hover:text-[var(--ed-text)]",
            className
          )}
        >
          {normalizedValue}
          {!readonly && <ChevronDown size="1.1em" strokeWidth={2} className="opacity-60" />}
        </button>
      }
    >
      <div className="flex h-[400px] flex-col gap-1 overflow-auto">
        <For
          data={CODE_BLOCK_LANGUAGE_OPTIONS}
          renderItem={item => {
            return (
              <div
                key={item.value}
                className={cn(
                  "flex h-[2em] cursor-pointer items-center rounded-[0.25em] px-[0.5em] py-[0.25em] font-[family-name:var(--ed-font-mono)] text-[0.9em] transition-colors duration-200 hover:bg-[var(--ed-bg-hover)]",
                  normalizedValue === item.value && "bg-[var(--ed-bg-hover)]"
                )}
                onClick={() => {
                  if (readonly) return;
                  onChange(item.value);
                  setOpen(false);
                }}
                style={{
                  color: "var(--ed-text)",
                }}
              >
                {item.label}
              </div>
            );
          }}
        />
      </div>
    </Popover>
  );
};

export default SelectLanguage;
