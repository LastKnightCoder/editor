import { useState, memo } from "react";
import classnames from "classnames";

import HideChildrenWithAnimation from "@/components/HideChildrenWithAnimation";
import For from "@/components/For";

import { TagOutlined } from "@ant-design/icons";

import { ICardTree } from "@/types";

import styles from "./index.module.less";

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

  const toggleOpen = () => {
    setOpen(!open);
  };

  return (
    <div className={styles.tagItem}>
      <div
        className={classnames(styles.header, { [styles.active]: active })}
        onClick={() => {
          onClickTag?.(tag);
        }}
      >
        <div className={styles.tagIcon}>
          <TagOutlined />
        </div>
        <div className={styles.tagName}>{tag}</div>
        <div
          className={styles.tagCount}
          onClick={(e) => {
            e.stopPropagation();
            if (children.length > 0) {
              toggleOpen();
            }
          }}
        >
          {cardIds.length}
        </div>
      </div>
      <HideChildrenWithAnimation open={open}>
        <div className={styles.children}>
          <For
            data={children}
            renderItem={(cardTree) => (
              <TagItem
                key={cardTree.tag}
                item={cardTree}
                onClickTag={(childTag) => {
                  onClickTag?.(tag + "/" + childTag);
                }}
                activeTag={activeTag.split("/").slice(1).join("/")}
              />
            )}
          />
        </div>
      </HideChildrenWithAnimation>
    </div>
  );
});

export default TagItem;
