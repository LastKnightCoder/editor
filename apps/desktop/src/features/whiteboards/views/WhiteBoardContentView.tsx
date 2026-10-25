/**
 * 单页画布页（whiteboard-content，参数为页 id）：画布里旧的按页嵌入、问题材料等只记了页 id 的入口。
 * 这一页属于某块白板时原位换成白板详情（定位到这一页，带页签条与「白板名 / 页名」面包屑）；
 * 不属于任何白板的独立页才在这里渲染（同一张纸面，无页签条）。
 */

import { useEffect, useMemo, useState } from "react";
import { Loading } from "@tau/ui";
import { usePage, usePageBreadcrumb, usePageParams } from "@/page/PageProvider";
import { BoardCanvas } from "../components/BoardCanvas";
import { OutlineToggle } from "../components/OutlineToggle";
import { useWhiteboardOwner } from "../queries";

export function WhiteBoardContentView() {
  const { id } = usePageParams<{ id: number }>();
  const { navigator } = usePage();
  const { owner, loading } = useWhiteboardOwner(id);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!owner) return;
    // 只替换栈顶的本页（查询返回前可能已经跳走）
    const top = navigator.current();
    if (top?.key !== "whiteboard-content" || top.params.id !== id) return;
    navigator.replace("whiteboard-detail", { id: owner.id, page: id });
  }, [owner, id, navigator]);

  const title = useMemo(
    () => (
      <span className="flex min-w-0 items-center gap-1">
        <OutlineToggle />
        <span className="text-tau-meta text-ink-2 min-w-0 truncate px-1.5">{name || "白板"}</span>
      </span>
    ),
    [name]
  );
  usePageBreadcrumb("whiteboard-content", title);

  if (loading || owner) return <Loading />;
  return (
    <div className="relative flex h-full min-h-0 flex-col px-4 pt-1 pb-4">
      <div className="bg-surface shadow-card rounded-tau-lg relative min-h-0 flex-1 overflow-hidden">
        <BoardCanvas key={id} id={id} collaboration onLoaded={content => setName(content.name)} />
      </div>
    </div>
  );
}
