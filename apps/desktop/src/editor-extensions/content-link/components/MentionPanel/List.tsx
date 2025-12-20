import { memo } from "react";
import { IExtension } from "@tau/editor/src";
import Item from "./Item";
import useMentionPanelStore from "../../stores/useMentionPanelStore";

interface IListProps {
  extensions: IExtension[];
}

const List = memo((props: IListProps) => {
  const { extensions } = props;

  const { searchResults, activeIndex, selectItem } = useMentionPanelStore(
    (state) => ({
      searchResults: state.searchResults,
      activeIndex: state.activeIndex,
      selectItem: state.selectItem,
    }),
  );

  const handleItemClick = (index: number) => {
    selectItem(index);
  };

  return (
    <div className="overflow-y-auto overflow-x-hidden max-h-[384px] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-black/15 dark:[&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-black/25 dark:hover:[&::-webkit-scrollbar-thumb]:bg-white/30">
      {searchResults.map((item, index) => (
        <Item
          key={`${item.id}-${item.type}`}
          item={item}
          active={index === activeIndex}
          extensions={extensions}
          onClick={() => handleItemClick(index)}
        />
      ))}
    </div>
  );
});

export default List;
