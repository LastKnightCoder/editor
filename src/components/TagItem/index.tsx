import { useState, memo } from "react";
import classnames from "classnames";

import For from "@/components/For";
import If from "@/components/If";
import { TagOutlined } from "@ant-design/icons";

import { ICardTree } from "@/types";

import styles from "./index.module.less";
import { useMemoizedFn } from "ahooks";

interface ITagItemProps {
  item: ICardTree;
  activeTag: string;
  onClickTag?: (tag: string) => void;
}

const TagItem = memo((props: ITagItemProps) => {
  const [open, setOpen] = useState(false);
  const { item, onClickTag, activeTag } = props;

  const { children, tag, cardIds } = item;

  const active = tag === activeTag.split("/")[0];

  const toggleOpen = useMemoizedFn(() => {
    setOpen(!open);
  });

  const handleClickTag = useMemoizedFn(() => {
    onClickTag?.(tag);
  });

  const handleClickChildTag = useMemoizedFn((childTag: string) => {
    onClickTag?.(tag + "/" + childTag);
  });

  const handleClickTagCount = useMemoizedFn(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      if (children.length > 0) {
        toggleOpen();
      }
    },
  );

  return (
    <div className={styles.tagItem}>
      <div
        className={classnames(styles.header, { [styles.active]: active })}
        onClick={handleClickTag}
      >
        <div className={styles.tagIcon}>
          <TagOutlined />
        </div>
        <div className={styles.tagName}>{tag}</div>
        <div className={styles.tagCount} onClick={handleClickTagCount}>
          {cardIds.length}
        </div>
      </div>
      <If condition={open}>
        <div className={styles.children}>
          <For
            data={children}
            renderItem={(cardTree) => (
              <TagItem
                key={cardTree.tag}
                item={cardTree}
                onClickTag={handleClickChildTag}
                activeTag={activeTag.split("/").slice(1).join("/")}
              />
            )}
          />
        </div>
      </If>
    </div>
  );
});

export default TagItem;
