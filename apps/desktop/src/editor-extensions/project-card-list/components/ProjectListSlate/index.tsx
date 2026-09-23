import ProjectList from "../ProjectList";
import { RenderElementProps } from "slate-react";
import { AddParagraph } from "@tau/editor/src";
import { useDragAndDrop } from "@tau/editor/src";
import type { ProjectCardListElement } from "../../types";
import { ProjectItem } from "@/types";
import classnames from "classnames";

import styles from "./index.module.less";
import { MdDragIndicator } from "react-icons/md";
import React from "react";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import { useProjectContext } from "@/features/projects/components/ProjectView/ProjectContext";

interface IProjectCardExtensionProps {
  element: ProjectCardListElement;
  attributes: RenderElementProps["attributes"];
  children: React.ReactNode;
}

const DocumentListSlate = (props: IProjectCardExtensionProps) => {
  const { attributes, children, element } = props;

  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } = useDragAndDrop({
    element,
  });

  const navigateTo = useTabStore(state => state.navigateTo);
  const { projectId } = useProjectContext();
  const onClickItem = (item: ProjectItem) => {
    navigateTo(TabType.ProjectDetail, { id: projectId, itemId: item.id }, `项目 - ${item.title}`);
  };

  const { projectItemId } = element;

  return (
    <div
      ref={node => {
        drop(node);
      }}
      className={classnames(styles.dropContainer, {
        [styles.dragging]: isDragging,
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
      })}
    >
      <ProjectList projectItemId={projectItemId} onClick={onClickItem} />
      <div {...attributes}>{children}</div>
      <AddParagraph element={element as any} />
      <div
        contentEditable={false}
        ref={node => {
          drag(node);
        }}
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
