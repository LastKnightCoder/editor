// 协作码输入：12 位按 4-4-4 分格展示，隐藏 input 捕获键盘（含粘贴整码）。
// 字符集与服务端一致：23456789ABCDEFGHJKLMNPQRSTUVWXYZ（排除易混淆的 I/O/0/1）。
import { useRef, useState } from "react";

const CODE_LENGTH = 12;
const INVALID_CHARACTERS = /[^2-9A-HJ-NP-Z]/g;

export function sanitizeJoinCode(raw: string) {
  return raw.toUpperCase().replace(INVALID_CHARACTERS, "").slice(0, CODE_LENGTH);
}

export function isCompleteJoinCode(value: string) {
  return value.length === CODE_LENGTH;
}

export function JoinCodeInput(props: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const cells = Array.from({ length: CODE_LENGTH }, (_, index) => props.value[index] ?? "");
  const cursor = Math.min(props.value.length, CODE_LENGTH - 1);

  return (
    <div className="relative" onPointerDown={() => inputRef.current?.focus()}>
      <input
        ref={inputRef}
        value={props.value}
        onChange={event => props.onChange(sanitizeJoinCode(event.currentTarget.value))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={props.disabled}
        inputMode="text"
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        aria-label="协作码"
        className="absolute inset-0 h-full w-full opacity-0"
      />
      <div className="flex justify-center gap-[9px]">
        {[0, 1, 2].map(group => (
          <div key={group} className="flex gap-[7px]">
            {cells.slice(group * 4, group * 4 + 4).map((cell, offset) => {
              const index = group * 4 + offset;
              const active = focused && index === cursor;
              return (
                <span
                  key={index}
                  className={`bg-input text-ink grid h-[34px] w-[24px] place-items-center rounded-[9px] font-mono text-[17px] font-extrabold ${
                    active
                      ? "border-accent bg-accent-soft border-[1.6px]"
                      : `border-[1.6px] ${cell ? "border-transparent" : "border-line"}`
                  }`}
                >
                  {active && !cell ? (
                    <span className="bg-accent h-[19px] w-[2px] animate-pulse rounded-full" />
                  ) : (
                    cell
                  )}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
