import React from "react";
import { RenderElementProps } from "slate-react";
import {TableElement} from "@/components/Editor/types";
import AddParagraph from "@/components/Editor/components/AddParagraph";

import styles from './index.module.less';

interface ITableProps {
  attributes: RenderElementProps['attributes'];
  element: TableElement;
}

const Table: React.FC<React.PropsWithChildren<ITableProps>> = (props) => {
  const { attributes, element, children } = props;

  return (
    <div>
      <table {...attributes} className={styles.table}>
        <tbody>
          {children}
        </tbody>
      </table>
      <AddParagraph element={element} />
    </div>
  )
}

export default Table;
