import React from "react";
import {RenderElementProps} from "slate-react";
import {TableElement} from "../../custom-types";

interface ITableProps {
  attributes: RenderElementProps['attributes'];
  element: TableElement;
}

const Table: React.FC<React.PropsWithChildren<ITableProps>> = (props) => {
  const { attributes, children } = props;

  return (
    <table {...attributes} className="table">
      {children}
    </table>
  )
}

export default Table;
