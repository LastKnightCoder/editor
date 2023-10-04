import classnames from 'classnames';
import styles from './index.module.less';
import {IBlockPanelListItem} from "../../../types/blockPanel.ts";
import {useEffect, useRef} from "react";

interface IItemProps {
  showBottomLine: boolean;
  item: IBlockPanelListItem;
  active: boolean;
  onClick?: () => void;
}

const Item = (props: IItemProps) => {
  const { showBottomLine, item, active, onClick } = props;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active) {
      // 滚动到可视区域
      ref.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'start',
      });
    }
  }, [active]);

  return (
    <div onClick={onClick} ref={ref} className={classnames(styles.item, { [styles.active]: active })}>
      <div className={styles.content}>
        {item.title}
      </div>
      { showBottomLine && <div className={styles.bottomLine} /> }
    </div>
  )
}

export default Item;