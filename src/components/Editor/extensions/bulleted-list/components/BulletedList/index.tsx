import React, { PropsWithChildren } from "react";
import { RenderElementProps } from "slate-react";
import classnames from "classnames";

import { BulletedListElement } from "@/components/Editor/types";
import useTheme from "../../../../hooks/useTheme";
import styles from "./index.module.less";

interface IBulletedListProps {
  attributes: RenderElementProps["attributes"];
  element: BulletedListElement;
}

const BulletedList: React.FC<PropsWithChildren<IBulletedListProps>> = (
  props,
) => {
  const { attributes, children } = props;
  const { isDark } = useTheme();
  return (
    <ul
      className={classnames(styles.list, { [styles.dark]: isDark })}
      {...attributes}
    >
      {children}
    </ul>
  );
};

export default BulletedList;
