import { PropsWithChildren } from "react";
import { RenderElementProps } from "slate-react";

import { DivideLineElement } from "@/components/Editor/types";
import AddParagraph from "@/components/Editor/components/AddParagraph";

import styles from './index.module.less';

interface DivideLineProps {
  attributes: RenderElementProps['attributes'];
  element: DivideLineElement;
}

const DivideLineElement: React.FC<PropsWithChildren<DivideLineProps>> = (props) => {
  const { attributes, children, element } = props;
  return (
    <div {...attributes} contentEditable={false} className={styles.divideLine}>
      {children}
      <AddParagraph element={element} />
    </div>
  )
}

export default DivideLineElement;
