import { useEffect, useRef } from "react";

interface EntryLocationOptions {
  sessionKey: string;
  entry?: string;
  visible: boolean;
  busy: boolean;
  messages: readonly { piEntryIds?: string[] }[];
  /** 目标在会话树里的哪条分支末端；不在树里（已删除）返回 null */
  findBranch(entry: string): Promise<string | null>;
  scrollTo(index: number): void;
  /** 目标不在当前分支：只提示，不替用户切换分支（切换会写回会话） */
  onElsewhere(reason: "other-branch" | "missing"): void;
  onLocated?: () => void;
  onError(error: unknown): void;
}

/** 对话页参数 entry 是一次性导航意图：在当前分支就滚过去，否则提示一次，都算消费掉 */
export function useChatEntryLocation(options: EntryLocationOptions) {
  const callbacks = useRef(options);
  callbacks.current = options;
  const handled = useRef<string | null>(null);
  const { sessionKey, entry, visible, busy, messages } = options;
  useEffect(() => {
    if (!entry) {
      handled.current = null;
      return;
    }
    const key = `${sessionKey}:${entry}`;
    if (!visible || handled.current === key) return;
    const actions = callbacks.current;
    const index = messages.findIndex(message => message.piEntryIds?.includes(entry));
    if (index >= 0) {
      const timer = setTimeout(() => {
        handled.current = key;
        actions.scrollTo(index);
        actions.onLocated?.();
      }, 0);
      return () => clearTimeout(timer);
    }
    if (busy) return;
    let cancelled = false;
    void actions
      .findBranch(entry)
      .then(tail => {
        if (cancelled) return;
        handled.current = key;
        actions.onElsewhere(tail ? "other-branch" : "missing");
        actions.onLocated?.();
      })
      .catch(error => {
        if (!cancelled) actions.onError(error);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionKey, entry, visible, busy, messages]);
}
