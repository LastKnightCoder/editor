import classNames from "classnames";
import { ChevronRight } from "lucide-react";
import { memo, useEffect, useRef } from "react";

import { IBlockPanelListItem } from "@/components/Editor/types";

import menuStyles from "../../EditorContextMenu/index.module.less";
import styles from "./index.module.less";

interface IItemProps {
  item: IBlockPanelListItem;
  active: boolean;
  hasChildren: boolean;
  shouldAutoScroll: boolean;
  onAnchorChange?: (element: HTMLButtonElement | null) => void;
  onClick?: () => void;
}

const Item = memo(
  ({
    item,
    active,
    hasChildren,
    shouldAutoScroll,
    onAnchorChange,
    onClick,
  }: IItemProps) => {
    const IconComponent = item.icon;
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
      if (active && shouldAutoScroll) {
        buttonRef.current?.scrollIntoView({
          block: "nearest",
          inline: "nearest",
        });
      }
    }, [active, shouldAutoScroll]);

    useEffect(() => {
      const element = buttonRef.current;
      if (onAnchorChange) {
        onAnchorChange(element);
      }
      return () => {
        if (onAnchorChange) {
          onAnchorChange(null);
        }
      };
    }, [onAnchorChange]);

    return (
      <button
        type="button"
        ref={buttonRef}
        className={classNames(menuStyles.menuItem, styles.item, {
          [styles.itemActive]: active,
        })}
        onClick={onClick}
      >
        <span className={styles.iconWrapper}>
          <IconComponent className={styles.icon} />
        </span>
        <div className={styles.content}>
          <span className={styles.title}>{item.title}</span>
          {item.description && (
            <span className={styles.description}>{item.description}</span>
          )}
        </div>
        {hasChildren && (
          <span className={classNames(menuStyles.menuItemArrow, styles.arrow)}>
            <ChevronRight size={14} />
          </span>
        )}
      </button>
    );
  },
);

Item.displayName = "BlockPanelItem";

export default Item;
