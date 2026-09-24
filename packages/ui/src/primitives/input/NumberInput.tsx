/**
 * NumberInput —— 数值输入（Input 同形 + beforeinput 事前拦截，mockups/input/ 方案 A）。
 *
 * 值契约：value: number | null（string 草稿只在内部，blur/Enter 归一化提交）。
 *
 * 事前拦截（2026-09-19 用户裁决，取代「事后标红」）：
 *  - 原生 beforeinput 监听用「当前值 + 选区 + 待插入文本」预判结果，不合数字格式直接
 *    preventDefault——键盘输入 / 粘贴 / 拖放的非数字内容根本进不来
 *  - 粘贴含杂质不生硬拒绝：先清洗（"¥1,200" → "1200"）再以 setRangeText 插入，
 *    实在洗不干净才放弃（静默，无红字）
 *  - 合法中间态（"5." / "-."）放行，否则没法输小数；IME 组合期间放行
 *    （insertCompositionText 不可取消），compositionend 兜底清洗
 *  - blur / Enter 归一化："5." → 5、".5" → 0.5、去多余前导零
 */

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { mergeRefs } from "../mergeRefs";
import { Input } from "./Input";
import { isValidNumberDraft, normalizeNumberDraft, sanitizePastedDigits } from "./numberGuard";

type NativeInputEvent = Event & { data: string | null; inputType: string };

export interface NumberInputProps extends Omit<
  ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "type" | "size"
> {
  value: number | null;
  onValueChange: (value: number | null) => void;
  size?: "sm" | "md";
  /** 形态透传 Input：bare 为无皮行内形态（无边框背景与 focus 反馈，归宿主） */
  variant?: "outlined" | "bare";
  /** 透传 Input：外框容器类名（定宽写这里；className 落到内部 <input>） */
  wrapperClassName?: string;
}

export function NumberInput({
  value,
  onValueChange,
  variant,
  onBlur,
  onKeyDown,
  ref,
  ...props
}: NumberInputProps) {
  const [draft, setDraft] = useState(() => (value == null ? "" : String(value)));
  const composing = useRef(false);
  const focused = useRef(false);
  const inputEl = useRef<HTMLInputElement | null>(null);

  // 外部值变化同步草稿（聚焦中不覆写——用户正在输入）
  useEffect(() => {
    if (!focused.current) setDraft(value == null ? "" : String(value));
  }, [value]);

  // 事前拦截走原生 addEventListener：React 合成的 onBeforeInput 在部分环境回退
  // polyfill 路径（与生产不一致），原生监听让行为处处相同
  useEffect(() => {
    const el = inputEl.current;
    if (!el) return;
    const onBeforeInputNative = (ev: Event) => {
      const native = ev as NativeInputEvent;
      if (composing.current || !native.data || native.inputType === "insertCompositionText") return;
      const s = el.selectionStart ?? 0;
      const t = el.selectionEnd ?? 0;
      const next = el.value.slice(0, s) + native.data + el.value.slice(t);
      if (isValidNumberDraft(next)) return;
      ev.preventDefault();
      // 粘贴清洗：剥杂质后仍合法则以 setRangeText 插入合法部分（"¥1,200" → "1200"）
      const cleaned = sanitizePastedDigits(native.data);
      const after = el.value.slice(0, s) + cleaned + el.value.slice(t);
      if (cleaned && isValidNumberDraft(after)) {
        el.setRangeText(cleaned, s, t, "end");
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };
    el.addEventListener("beforeinput", onBeforeInputNative);
    return () => el.removeEventListener("beforeinput", onBeforeInputNative);
  }, []);

  const commit = () => {
    const n = normalizeNumberDraft(draft);
    setDraft(n == null ? "" : String(n)); // 非法残留（IME 漏网）一并清空
    if (n !== value) onValueChange(n);
  };

  return (
    <Input
      {...props}
      variant={variant}
      ref={mergeRefs(ref, el => {
        inputEl.current = el;
      })}
      type="text"
      inputMode="decimal"
      value={draft}
      onFocus={e => {
        focused.current = true;
        props.onFocus?.(e);
      }}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={e => {
        composing.current = false;
        const el = e.currentTarget;
        const cleaned = sanitizePastedDigits(el.value);
        if (cleaned !== el.value && isValidNumberDraft(cleaned)) {
          const pos = el.selectionStart;
          el.value = cleaned;
          el.setSelectionRange(pos, pos);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }}
      onChange={e => {
        setDraft(e.target.value);
        const n = normalizeNumberDraft(e.target.value);
        if (n !== null || e.target.value.trim() === "")
          onValueChange(e.target.value.trim() === "" ? null : n);
      }}
      onKeyDown={e => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) commit();
        onKeyDown?.(e);
      }}
      onBlur={e => {
        focused.current = false;
        commit();
        onBlur?.(e);
      }}
    />
  );
}
