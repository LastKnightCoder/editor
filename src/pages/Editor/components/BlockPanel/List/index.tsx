import styles from './index.module.less';
import Item from '../Item';
import useBlockPanelStore from "../../../stores/useBlockPanelStore.ts";


const List = () => {
  const {
    list,
    activeIndex
  } = useBlockPanelStore(state => ({
    list: state.list,
    activeIndex: state.activeIndex,
  }));
  return (
    <div className={styles.list}>
      {
        list.map((item, index) => (
          <Item
            key={index}
            showBottomLine={index !== list.length - 1}
            item={item}
            active={index === activeIndex}
          />
        ))
      }
    </div>
  )
}

export default List;