/**
 * 撤销窗口内暂存的破坏性操作（删除问题、解除关联）：立即从视图隐藏，UNDO_MS 后真正落库；
 * 撤销即取消；离开页面（卸载）时立刻落库。
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "@tau/ui";

const UNDO_MS = 5000;

export function useDeferredActions() {
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const timers = useRef(new Map<string, { timer: number; commit: () => Promise<unknown> }>());

  const drop = (key: string) =>
    setPending(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });

  const commit = (key: string) => {
    const entry = timers.current.get(key);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    timers.current.delete(key);
    entry
      .commit()
      .catch(() => toast.error("操作失败"))
      .finally(() => drop(key));
  };
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(
    () => () => {
      for (const key of [...timers.current.keys()]) commitRef.current(key);
    },
    []
  );

  const schedule = (key: string, message: string, run: () => Promise<unknown>) => {
    if (timers.current.has(key)) return;
    setPending(prev => new Set(prev).add(key));
    timers.current.set(key, {
      timer: window.setTimeout(() => commitRef.current(key), UNDO_MS),
      commit: run,
    });
    toast.info(message, {
      duration: UNDO_MS,
      action: {
        label: "撤销",
        onClick: () => {
          const entry = timers.current.get(key);
          if (!entry) return;
          window.clearTimeout(entry.timer);
          timers.current.delete(key);
          drop(key);
        },
      },
    });
  };

  return { pending, schedule };
}
