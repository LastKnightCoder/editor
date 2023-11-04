import React from "react";
import { RenderElementProps } from "slate-react";
import AddParagraph from "@/components/Editor/components/AddParagraph";
import { MultiColumnContainerElement } from "@/components/Editor/types";

import styles from './index.module.less';

interface IMultiColumnsContainerProps {
  attributes: RenderElementProps['attributes'];
  element: MultiColumnContainerElement;
}

const MultiColumnsContainer: React.FC<React.PropsWithChildren<IMultiColumnsContainerProps>> = (props) => {
  const { attributes, element, children } = props;

  return (
    <div>
      <div className={styles.container} {...attributes}>
        {children}
      </div>
      <AddParagraph element={element} />
    </div>
  )
}

export default MultiColumnsContainer;