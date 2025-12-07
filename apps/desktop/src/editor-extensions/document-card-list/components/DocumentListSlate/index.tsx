import DocumentList from "../DocumentList";
import { RenderElementProps } from "slate-react";
import { AddParagraph } from "@tau/editor/src";
import { useDragAndDrop } from "@tau/editor/src";
import { DocumentCardListElement } from "@/editor-extensions/document-card-list";
import { IDocumentItem } from "@/types";
import classnames from "classnames";

import styles from "./index.module.less";
import { MdDragIndicator } from "react-icons/md";
import React from "react";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import { useDocumentContext } from "@/pages/DocumentView/DocumentContext";

interface IDocumentCardExtensionProps {
  element: DocumentCardListElement;
  attributes: RenderElementProps["attributes"];
  children: React.ReactNode;
}

const DocumentListSlate = (props: IDocumentCardExtensionProps) => {
  const { documentId } = useDocumentContext();
  const { attributes, children, element } = props;
  const navigateTo = useTabStore((state) => state.navigateTo);

  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      // @ts-ignore
      element,
    });

  const onClickItem = (item: IDocumentItem) => {
    navigateTo(
      TabType.DocumentDetail,
      { id: documentId, itemId: item.id },
      `知识库 - ${item.title}`,
    );
  };

  const { documentItemId } = element;

  return (
    <div
      ref={drop}
      className={classnames(styles.dropContainer, {
        [styles.dragging]: isDragging,
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
      })}
    >
      <DocumentList documentItemId={documentItemId} onClick={onClickItem} />
      <div {...attributes}>{children}</div>
      <AddParagraph element={element as any} />
      <div
        contentEditable={false}
        ref={drag}
        className={classnames(styles.dragHandler, {
          [styles.canDrag]: canDrag,
        })}
      >
        <MdDragIndicator className={styles.icon} />
      </div>
    </div>
  );
};

export default DocumentListSlate;
