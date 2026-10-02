import { useEffect, useRef } from "react";

interface EntryLocationOptions {
  sessionKey: string;
  entry?: string;
  visible: boolean;
  busy: boolean;
  messages: readonly { piEntryIds?: string[] }[];
  findBranch(entry: string): Promise<string | null>;
  switchBranch(entry: string): Promise<unknown>;
  scrollTo(index: number): void;
  onLocated?: () => void;
  onError(error: unknown): void;
}

export function useChatEntryLocation(options: EntryLocationOptions) {
  const callbacks = useRef(options);
  callbacks.current = options;
  const located = useRef<string | null>(null);
  const switched = useRef<string | null>(null);
  const { sessionKey, entry, visible, busy, messages } = options;
  useEffect(() => {
    if (!entry) {
      located.current = null;
      switched.current = null;
      return;
    }
    const key = `${sessionKey}:${entry}`;
    if (!visible || located.current === key) return;
    const actions = callbacks.current;
    const index = messages.findIndex(message => message.piEntryIds?.includes(entry));
    if (index >= 0) {
      const timer = setTimeout(() => {
        located.current = key;
        actions.scrollTo(index);
        actions.onLocated?.();
      }, 0);
      return () => clearTimeout(timer);
    }
    if (busy || switched.current === key) return;
    let cancelled = false;
    void actions
      .findBranch(entry)
      .then(async tail => {
        if (cancelled || !tail) return;
        switched.current = key;
        await actions.switchBranch(tail);
      })
      .catch(error => {
        if (!cancelled) actions.onError(error);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionKey, entry, visible, busy, messages]);
}
