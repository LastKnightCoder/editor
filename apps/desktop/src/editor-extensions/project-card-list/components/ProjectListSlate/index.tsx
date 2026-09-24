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
import { toast } from "@tau/ui";
import { openContent } from "@/services/open-content";

interface IProjectCardExtensionProps {
  element: ProjectCardListElement;
  attributes: RenderElementProps["attributes"];
  children: React.ReactNode;
}

const ProjectListSlate = (props: IProjectCardExtensionProps) => {
  const { attributes, children, element } = props;

  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } = useDragAndDrop({
    element,
  });

  const onClickItem = async (item: ProjectItem) => {
    try {
      await openContent("project-item", item.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "打开项目文档失败");
    }
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

export default ProjectListSlate;
