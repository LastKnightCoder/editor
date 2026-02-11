import React, { PropsWithChildren } from "react";
import { RenderElementProps } from "slate-react";
import type { CheckListElement } from "../../../types";
import classnames from "classnames";
import styles from "./index.module.less";
import useDragAndDrop from "../../../../hooks/useDragAndDrop";

interface ICheckListProps {
  attributes: RenderElementProps["attributes"];
  element: CheckListElement;
}

const CheckList: React.FC<PropsWithChildren<ICheckListProps>> = (props) => {
  const { attributes, children, element } = props;

  const { drop, canDrop, isBefore, isOverCurrent } = useDragAndDrop({
    element,
  });

  return (
    <div
      ref={(node) => {
        drop(node);
      }}
      className={classnames({
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
      })}
    >
      <ul className={styles.list} {...attributes}>
        {children}
      </ul>
    </div>
  );
};

export default CheckList;
