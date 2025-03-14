import React from "react";
import classnames from "classnames";

import For from "@/components/For";
import If from "@/components/If";

import styles from "./index.module.less";

interface IActionProps {
  icon: React.ReactNode;
  onClick?: () => void;
}

interface IActionsProps {
  actions: IActionProps[];
  hasDivider?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const Actions = (props: IActionsProps) => {
  const { actions, hasDivider = true, className, style } = props;
  return (
    <div className={classnames(styles.actions, className)} style={style}>
      <For
        data={actions}
        renderItem={(action) => (
          <>
            <div onClick={action.onClick} className={styles.item}>
              {action.icon}
            </div>
            <If condition={hasDivider}>
              <div className={styles.divider}></div>
            </If>
          </>
        )}
      />
    </div>
  );
};

export default Actions;
