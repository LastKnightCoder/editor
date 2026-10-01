import { useState } from "react";
import { useReadOnly } from "slate-react";
import { Plus } from "lucide-react";

import type { ITabItem } from "../../types";
import { If } from "@tau/shared";
import TabTitle from "../TabTitle";

interface ITabsHeaderProps {
  tabs: ITabItem[];
  activeKey: string;
  onClickTab: (key: string) => void;
  onDeleteTab: (key: string) => void;
  onAddTab: () => void;
  onTitleChange: (key: string, title: string) => void;
  onMoveTab: (fromKey: string, insertAt: number) => void;
}

const TabsHeader = (props: ITabsHeaderProps) => {
  const { tabs, activeKey, onAddTab, onClickTab, onDeleteTab, onTitleChange, onMoveTab } = props;
  const readOnly = useReadOnly();
  // 拖拽插入指示：在 index 号 Tab 的左/右两侧
  const [dropHint, setDropHint] = useState<{ index: number; before: boolean } | null>(null);

  const handleReorder = (fromKey: string, toIndex: number, before: boolean) => {
    setDropHint(null);
    onMoveTab(fromKey, before ? toIndex : toIndex + 1);
  };

  return (
    <div
      contentEditable={false}
      role="tablist"
      className="scrollbar-hide flex items-center gap-1 overflow-x-auto rounded-t-[10px] bg-zinc-950/[0.04] px-1.5 py-1.5 dark:bg-white/[0.05]"
    >
      {/* Pill 胶囊：激活项为灰底上浮起的白色胶囊 */}
      {tabs.map((tab, index) => (
        <TabTitle
          key={tab.key}
          tab={tab}
          index={index}
          activeKey={activeKey}
          dropBefore={dropHint?.index === index && dropHint.before}
          dropAfter={dropHint?.index === index && !dropHint.before}
          onHoverDrop={setDropHint}
          onReorder={handleReorder}
          onClickTab={onClickTab}
          onDeleteTab={onDeleteTab}
          onTitleChange={onTitleChange}
        />
      ))}
      <If condition={!readOnly}>
        <button
          aria-label="添加标签"
          title="添加标签"
          onClick={onAddTab}
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-zinc-400 transition-colors hover:bg-zinc-950/[0.05] hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-white/[0.07] dark:hover:text-zinc-200"
        >
          <Plus size={15} />
        </button>
      </If>
    </div>
  );
};

export default TabsHeader;
