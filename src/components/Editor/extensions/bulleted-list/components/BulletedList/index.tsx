import React, { PropsWithChildren } from "react";
import { RenderElementProps } from "slate-react";

import { BulletedListElement } from "@/components/Editor/types";
// import AddParagraph from "@/components/Editor/components/AddParagraph";

import styles from './index.module.less';

interface IBulletedListProps {
  attributes: RenderElementProps['attributes'];
  element: BulletedListElement;
}

const BulletedList: React.FC<PropsWithChildren<IBulletedListProps>> = (props) => {
  const { attributes, children } = props;
  return (
    <div>
      <ul className={styles.list} {...attributes}>
        {children}
      </ul>
      {/* <AddParagraph element={element} /> */}
    </div>
  )
}

export default BulletedList;
