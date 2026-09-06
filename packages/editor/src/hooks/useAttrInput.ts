import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, CompositionEvent, KeyboardEvent } from "react";

/**
 * 节点属性的受控输入：本地草稿即时显示、变化才提交，
 * 输入法组词（composition）期间不提交，避免中文输入被打断
 */
export function useAttrInput(value: string | undefined, commit: (next: string) => void) {
  const [draft, setDraft] = useState(value ?? "");
  const composingRef = useRef(false);
  const committedRef = useRef(value ?? "");

  useEffect(() => {
    committedRef.current = value ?? "";
    if (!composingRef.current) {
      setDraft(value ?? "");
    }
  }, [value]);

  const commitDraft = (next: string) => {
    setDraft(next);
    if (next === committedRef.current) {
      return;
    }
    committedRef.current = next;
    commit(next);
  };

  return {
    value: draft,
    onCompositionStart: () => {
      composingRef.current = true;
    },
    onCompositionEnd: (event: CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      composingRef.current = false;
      commitDraft(event.currentTarget.value);
    },
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft(event.currentTarget.value);
      if (!composingRef.current) {
        commitDraft(event.currentTarget.value);
      }
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      // 回车提交并移开焦点，避免敲回车影响编辑器光标
      if (event.key === "Enter") {
        event.preventDefault();
        event.currentTarget.blur();
      }
    },
  };
}
