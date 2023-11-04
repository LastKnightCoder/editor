import React, { PropsWithChildren } from "react";
import { ReactEditor, RenderElementProps, useSlate } from "slate-react";
import { CheckListItemElement } from "@/components/Editor/types";
import { Checkbox } from "antd";
import { Transforms } from "slate";
import styles from './index.module.less';

interface CheckListItemProps {
  attributes: RenderElementProps['attributes'];
  element: CheckListItemElement;
}

const CheckListItem: React.FC<PropsWithChildren<CheckListItemProps>> = (props) => {
  const { attributes, children, element } = props;
  const { checked } = element;

  const editor = useSlate();

  const onClick = () => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { checked: !checked }, { at: path });
  }

  return (
    <li {...attributes} className={styles.item}>
      <Checkbox tabIndex={-1} className={styles.checkbox} checked={checked} onClick={onClick} />
      <div>
        {children}
      </div>
    </li>
  )
}

export default CheckListItem;