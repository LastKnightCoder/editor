import { useEffect, useRef, memo } from "react";
import classnames from "classnames";

import { IBlockPanelListItem } from "@/components/Editor/types";

import styles from "./index.module.less";

interface IItemProps {
  showBottomLine: boolean;
  item: IBlockPanelListItem;
  active: boolean;
  onClick?: () => void;
}

const Item = memo((props: IItemProps) => {
  const { showBottomLine, item, active, onClick } = props;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active) {
      // 滚动到可视区域
      ref.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "start",
      });
    }
  }, [active]);

  return (
    <div
      onClick={onClick}
      ref={ref}
      className={classnames(styles.item, { [styles.active]: active })}
    >
      <div className={styles.content}>{item.title}</div>
      {showBottomLine && <div className={styles.bottomLine} />}
    </div>
  );
});

export default Item;
