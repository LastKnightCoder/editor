import React from "react";
import { RenderElementProps } from "slate-react";
import styles from './index.module.less';
import {TableElement} from "../../custom-types";
import AddParagraph from "../AddParagraph";

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
