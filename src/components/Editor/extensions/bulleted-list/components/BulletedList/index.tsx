import React, { PropsWithChildren } from "react";
import { RenderElementProps } from "slate-react";

import { BulletedListElement } from "@/components/Editor/types";

import styles from './index.module.less';

interface IBulletedListProps {
  attributes: RenderElementProps['attributes'];
  element: BulletedListElement;
}

const BulletedList: React.FC<PropsWithChildren<IBulletedListProps>> = (props) => {
  const { attributes, children } = props;

  return (
    <ul className={styles.list} {...attributes}>
      {children}
    </ul>
  )
}

export default BulletedList;
