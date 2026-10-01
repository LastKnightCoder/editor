import ProjectList from "../ProjectList";
import { RenderElementProps } from "slate-react";
import { AddParagraph } from "@tau/editor";
import type { ProjectCardListElement } from "../../types";
import { ProjectItem } from "@/types";
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

  const onClickItem = async (item: ProjectItem) => {
    try {
      await openContent("project-item", item.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "打开项目文档失败");
    }
  };

  const { projectItemId } = element;

  return (
    <div className="relative">
      <ProjectList projectItemId={projectItemId} onClick={onClickItem} />
      <div {...attributes}>{children}</div>
      <AddParagraph element={element as any} />
    </div>
  );
};

export default ProjectListSlate;
