import { memo } from "react";
import { IExtension } from "@tau/editor/src";
import Item from "./Item";
import useMentionPanelStore from "../../stores/useMentionPanelStore";

interface IListProps {
  extensions: IExtension[];
  /** 当前搜索词（不含 @），用于标出命中字 */
  query: string;
}

// 保持搜索返回的相关性顺序（不按类型分组重排——↑↓ 的 activeIndex 按原序走）
const List = memo((props: IListProps) => {
  const { query } = props;

  const { searchResults, activeIndex, selectItem, setState } = useMentionPanelStore(state => ({
    searchResults: state.searchResults,
    activeIndex: state.activeIndex,
    selectItem: state.selectItem,
    setState: state.setState,
  }));

  return (
    <div
      role="listbox"
      aria-label="引用内容"
      className="max-h-[320px] min-h-0 overflow-y-auto p-1.5"
    >
      {searchResults.map((item, index) => (
        <Item
          key={`${item.id}-${item.type}`}
          item={item}
          query={query}
          active={index === activeIndex}
          onHover={() => setState({ activeIndex: index })}
          onClick={() => selectItem(index)}
        />
      ))}
    </div>
  );
});

export default List;
