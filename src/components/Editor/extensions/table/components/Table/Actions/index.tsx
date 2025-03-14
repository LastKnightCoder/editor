import React from "react";

import If from "@/components/If";
import For from "@/components/For";

import styles from "./index.module.less";

interface IActionItem {
  isTitle?: boolean;
  content: React.ReactNode;
  onClick?: () => void;
}

interface IActionsProps {
  items: IActionItem[];
}

const Actions = (props: IActionsProps) => {
  const { items } = props;
  return (
    <div className={styles.itemContainer}>
      <For
        data={items}
        renderItem={(item, index) => (
          <>
            <If condition={!!item.isTitle}>
              <div className={styles.title}>{item.content}</div>
            </If>
            <If condition={!item.isTitle}>
              <div className={styles.item} key={index} onClick={item.onClick}>
                {item.content}
              </div>
            </If>
          </>
        )}
      />
    </div>
  );
};

export default Actions;
