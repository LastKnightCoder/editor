import ProjectList from "../ProjectList";
import { RenderElementProps } from "slate-react";
import AddParagraph from "@/components/Editor/components/AddParagraph";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";
import { ProjectCardListElement } from "@/editor-extensions/project-card-list";
import { ProjectItem } from "@/types";
import classnames from "classnames";

import styles from "./index.module.less";
import { MdDragIndicator } from "react-icons/md";
import React from "react";
import useProjectsStore from "@/stores/useProjectsStore.ts";

interface IProjectCardExtensionProps {
  element: ProjectCardListElement;
  attributes: RenderElementProps['attributes'];
  children: React.ReactNode;
}

const DocumentListSlate = (props: IProjectCardExtensionProps) => {
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

  const onClickItem = (item: ProjectItem) => {
    useProjectsStore.setState({
      activeProjectItemId: item.id,
    })
  }

  const { projectItemId } = element;

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
      <ProjectList projectItemId={projectItemId} onClick={onClickItem} />
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
