import classnames from 'classnames';
import styles from './index.module.less';
import {IBlockPanelListItem} from "../../../types/blockPanel.ts";

interface IItemProps {
  showBottomLine: boolean;
  item: IBlockPanelListItem;
  active: boolean;
}

const Item = (props: IItemProps) => {
  const { showBottomLine, item, active } = props;



  return (
    <div className={classnames(styles.item, { [styles.active]: active })}>
      <div className={styles.content}>
        {item.title}
      </div>
      { showBottomLine && <div className={styles.bottomLine} /> }
    </div>
  )
}

export default Item;