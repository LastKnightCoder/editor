/**
 * 脉络浮层末尾的一行「创作白板 · N 份资料」：这篇摊开过哪些资料不进脉络分区（是工作区、不是内容关系），
 * 只给一个回到创作模式的入口。没有素材板或板上没有资料时不渲染。
 */

import { PanelsLeftRight } from "lucide-react";
import { ContextRow } from "@/features/context/components/ContextList";
import { useComposeBoardSummary } from "../queries";

export function ComposeBoardEntry({ contentId, onOpen }: { contentId: number; onOpen(): void }) {
  const { data } = useComposeBoardSummary(contentId);
  if (!data?.documents) return null;
  return (
    <div className="border-line-2 mx-1.5 mb-1.5 border-t pt-1.5">
      <ContextRow onClick={onOpen}>
        <span className="text-ink-3 flex min-w-0 items-center gap-1.5 text-[12px]">
          <PanelsLeftRight className="size-[13px] shrink-0" strokeWidth={1.75} />
          <b className="text-ink-2 font-medium">创作白板</b>
          <span className="tabular-nums">{data.documents} 份资料</span>
        </span>
      </ContextRow>
    </div>
  );
}
