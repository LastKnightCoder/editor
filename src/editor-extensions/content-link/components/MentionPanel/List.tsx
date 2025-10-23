import { memo } from "react";
import IExtension from "@/components/Editor/extensions/types";
import Item from "./Item";
import useMentionPanelStore from "../../stores/useMentionPanelStore";

import styles from "./index.module.less";

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
    <div className={styles.list}>
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
