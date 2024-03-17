import React from "react";
import { motion } from "framer-motion";
import { CloseOutlined } from '@ant-design/icons';
import classnames from "classnames";

import useDragAndDrop from "./useDragAndDrop";

import styles from './index.module.less';

interface ITabItemProps {
  cardId: number;
  title: string;
  active?: boolean;
  onClick?: () => void;
  onClose?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

const TabItem = (props: ITabItemProps) => {
  const { cardId, title, active = false, onClick, onClose, onContextMenu } = props;

  const {
    ref,
    isDragging,
    isOver,
    canDrop,
  } = useDragAndDrop({
    cardId
  });

  return (
    <motion.div
      layoutId={String(cardId)}
      ref={ref}
      className={classnames(styles.item, {
        [styles.active]: active,
        [styles.drop]: isOver && canDrop,
      })}
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <div className={styles.textContainer}>
        <div className={styles.text}>{title}</div>
        <div className={styles.closeIcon} onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          onClose?.();
        }}>
          <CloseOutlined />
        </div>
      </div>
    </motion.div>
  )
}

export default TabItem;