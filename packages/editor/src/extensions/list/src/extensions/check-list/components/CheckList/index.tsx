import React, { PropsWithChildren } from "react";
import { RenderElementProps } from "slate-react";
import type { CheckListElement } from "../../../../types";

interface ICheckListProps {
  attributes: RenderElementProps["attributes"];
  element: CheckListElement;
}

const CheckList: React.FC<PropsWithChildren<ICheckListProps>> = props => {
  const { attributes, children } = props;

  return (
    <ul className="m-0 ps-[0.75em] [&_[data-check-list-item]]:mb-[1.25em]" {...attributes}>
      {children}
    </ul>
  );
};

export default CheckList;
