import type { Flashcard } from "@/types";
import { toast } from "@tau/ui";
import { useEffect, useRef, useState } from "react";
import type { FlashcardMutations } from "../queries";

const UNDO_MS = 5000;

export function useDeferredCardDelete(mutations: Pick<FlashcardMutations, "deleteCard">) {
  /* 删除暂存：立即从视图消失，撤销 toast 关闭时真正落库；撤销即取消；离开页面时立刻落库。
     落库挂在 toast 的 onClose 上：悬停冻结自动关闭会连带延长撤销窗口，不会有死按钮。
     deleteCard 需等重拉落地再 resolve——否则放开 pending 时旧数据会让卡片闪回 */
  const [pendingDelete, setPendingDelete] = useState<ReadonlySet<number>>(() => new Set());
  const commits = useRef(new Map<number, () => Promise<unknown>>());
  const commitDelete = (id: number) => {
    const run = commits.current.get(id);
    if (!run) return;
    commits.current.delete(id);
    run()
      .catch(() => toast.error("删除失败"))
      .finally(() =>
        setPendingDelete(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        })
      );
  };
  const commitRef = useRef(commitDelete);
  commitRef.current = commitDelete;
  useEffect(
    () => () => {
      for (const id of [...commits.current.keys()]) commitRef.current(id);
    },
    []
  );
  const scheduleDelete = (card: Flashcard) => {
    if (commits.current.has(card.id)) return;
    setPendingDelete(prev => new Set(prev).add(card.id));
    commits.current.set(card.id, () => mutations.deleteCard(card.id));
    toast.info("已删除闪卡", {
      duration: UNDO_MS,
      onClose: () => commitRef.current(card.id),
      action: {
        label: "撤销",
        onClick: () => {
          // 撤销先于 onClose 触发：摘掉待落库条目后，随后的 onClose 空转
          if (!commits.current.has(card.id)) return;
          commits.current.delete(card.id);
          setPendingDelete(prev => {
            const next = new Set(prev);
            next.delete(card.id);
            return next;
          });
        },
      },
    });
  };

  return { pendingDelete, scheduleDelete };
}
