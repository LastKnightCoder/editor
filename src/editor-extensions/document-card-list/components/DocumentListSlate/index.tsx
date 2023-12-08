import DocumentList from "../DocumentList";
import { RenderElementProps } from "slate-react";
import AddParagraph from "@/components/Editor/components/AddParagraph";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";
import { DocumentCardListElement } from "@/editor-extensions/document-card-list";
import useDocumentsStore from "@/stores/useDocumentsStore.ts";
import { IDocumentItem } from "@/types";
import classnames from "classnames";

import styles from "./index.module.less";
import { MdDragIndicator } from "react-icons/md";
import React from "react";

interface IDocumentCardExtensionProps {
  element: DocumentCardListElement;
  attributes: RenderElementProps['attributes'];
  children: React.ReactNode;
}

const DocumentListSlate = (props: IDocumentCardExtensionProps) => {
  const { attributes, children, element } = props;

  const {
    drag,
    drop,
    isDragging,
    canDrag,
    canDrop,
    isBefore,
    isOverCurrent,
  } = useDragAndDrop({
    // @ts-ignore
    element,
  })

  const onClickItem = (item: IDocumentItem) => {
    useDocumentsStore.setState({
      activeDocumentItem: item,
    });
  }

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
      <DocumentList documentItemId={documentItemId} onClick={onClickItem}/>
      <div {...attributes}>
        {children}
      </div>
      <AddParagraph element={element as any} />
      <div contentEditable={false} ref={drag} className={classnames(styles.dragHandler, { [styles.canDrag]: canDrag })}>
        <MdDragIndicator className={styles.icon}/>
      </div>
    </div>
  )
}

export default DocumentListSlate;