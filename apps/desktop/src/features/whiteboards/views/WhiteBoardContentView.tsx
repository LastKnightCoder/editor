/**
 * 单页画布页（whiteboard-content，参数为页 id）：独立白板、画布里嵌套的白板、问题材料等入口打开的单页。
 * 只有这一页，不显示页签栏；属于某个多页白板的页从白板列表进来时走 whiteboard-detail。
 */

import { useMemo, useState } from "react";
import { usePageBreadcrumb, usePageParams } from "@/page/PageProvider";
import { BoardCanvas } from "../components/BoardCanvas";
import { OutlineToggle } from "../components/OutlineToggle";

export function WhiteBoardContentView() {
  const { id } = usePageParams<{ id: number }>();
  const [name, setName] = useState("");
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
  return <BoardCanvas key={id} id={id} onLoaded={content => setName(content.name)} />;
}
