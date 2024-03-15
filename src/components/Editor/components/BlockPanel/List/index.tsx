import { memo } from 'react';
import { useSlate } from "slate-react";
import styles from './index.module.less';
import Item from '../Item';
import useBlockPanelStore from "../../../stores/useBlockPanelStore.ts";


const List = memo(() => {
  const editor = useSlate();
  const {
    list,
    activeIndex,
    selectItem
  } = useBlockPanelStore(state => ({
    list: state.list,
    activeIndex: state.activeIndex,
    selectItem: state.selectItem,
  }));

  if (list.length === 0) return null;

  return (
    <div className={styles.list}>
      {
        list.map((item, index) => (
          <Item
            key={index}
            showBottomLine={index !== list.length - 1}
            item={item}
            active={index === activeIndex}
            onClick={() => { selectItem(editor, index) }}
          />
        ))
      }
    </div>
  )
});

export default List;