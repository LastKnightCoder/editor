import ProjectList from "../ProjectList";
import { RenderElementProps } from "slate-react";
import {
  AddParagraph,
  BLOCK_DRAG_GROUP,
  DragHandle,
  DropIndicator,
  dimWhileDragging,
  useDragAndDrop,
} from "@tau/editor/src";
import type { ProjectCardListElement } from "../../types";
import { ProjectItem } from "@/types";
import React from "react";
import { cn, toast } from "@tau/ui";
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
  const dropActive = isOverCurrent && canDrop;

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
      className={cn("relative", BLOCK_DRAG_GROUP, dimWhileDragging(isDragging || dropActive))}
    >
      <DropIndicator active={dropActive} before={isBefore} />
      <ProjectList projectItemId={projectItemId} onClick={onClickItem} />
      <div {...attributes}>{children}</div>
      <AddParagraph element={element as any} />
      <DragHandle
        dragRef={node => {
          drag(node);
        }}
        canDrag={canDrag}
      />
    </div>
  );
};

export default ProjectListSlate;
