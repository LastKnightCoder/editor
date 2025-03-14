import React, { PropsWithChildren } from "react";
import { RenderElementProps } from "slate-react";

import { NumberedListElement } from "@/components/Editor/types";
// import AddParagraph from "@/components/Editor/components/AddParagraph";

import styles from "./index.module.less";

interface INumberedListProps {
  attributes: RenderElementProps["attributes"];
  element: NumberedListElement;
}

const NumberedList: React.FC<PropsWithChildren<INumberedListProps>> = (
  props,
) => {
  const { attributes, children } = props;
  return (
    <ol className={styles.list} {...attributes}>
      {children}
    </ol>
  );
};

export default NumberedList;
