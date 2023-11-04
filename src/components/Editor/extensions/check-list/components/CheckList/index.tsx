import React, { PropsWithChildren } from 'react';
import { RenderElementProps } from "slate-react";
import { CheckListElement } from "@/components/Editor/types";
import AddParagraph from "@/components/Editor/components/AddParagraph";
import styles from './index.module.less';

interface ICheckListProps {
  attributes: RenderElementProps['attributes'];
  element: CheckListElement;
}

const CheckList: React.FC<PropsWithChildren<ICheckListProps>> = (props) => {
  const { attributes, children, element } = props;
  return (
    <ul className={styles.list} {...attributes}>
      {children}
      <AddParagraph element={element} />
    </ul>
  )
}

export default CheckList;
