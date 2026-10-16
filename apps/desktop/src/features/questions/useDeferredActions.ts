/**
 * 撤销窗口内暂存的破坏性操作（删除问题、解除关联）：立即从视图隐藏，撤销 toast 关闭时真正落库；
 * 撤销即取消；离开页面（卸载）时立刻落库。
 * 落库挂在 toast 的 onClose 上而非自备定时器：悬停冻结自动关闭会连带延长撤销窗口，
 * 不会出现「toast 还在、落库已执行」的死按钮。run 要在受影响查询重拉落地后再 resolve——
 * 否则放开 pending 时旧数据会让条目闪回。
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "@tau/ui";

const UNDO_MS = 5000;

export function useDeferredActions() {
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const commits = useRef(new Map<string, () => Promise<unknown>>());

  const drop = (key: string) =>
    setPending(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });

  const commit = (key: string) => {
    const run = commits.current.get(key);
    if (!run) return;
    commits.current.delete(key);
    run()
      .catch(() => toast.error("操作失败"))
      .finally(() => drop(key));
  };
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(
    () => () => {
      for (const key of [...commits.current.keys()]) commitRef.current(key);
    },
    []
  );

  const schedule = (key: string, message: string, run: () => Promise<unknown>) => {
    if (commits.current.has(key)) return;
    setPending(prev => new Set(prev).add(key));
    commits.current.set(key, run);
    toast.info(message, {
      duration: UNDO_MS,
      onClose: () => commitRef.current(key),
      action: {
        label: "撤销",
        onClick: () => {
          // 撤销先于 onClose 触发：摘掉待落库条目后，随后的 onClose 空转
          if (!commits.current.has(key)) return;
          commits.current.delete(key);
          drop(key);
        },
      },
    });
  };

  return { pending, schedule };
}
