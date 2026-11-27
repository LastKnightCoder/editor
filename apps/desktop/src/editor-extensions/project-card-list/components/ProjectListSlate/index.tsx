import ProjectList from "../ProjectList";
import { RenderElementProps } from "slate-react";
import { AddParagraph } from "@tau/editor";
import type { ProjectCardListElement } from "../../types";
import { ProjectItem } from "@/types";
import React from "react";
import { toast } from "@tau/ui";
import { openContent } from "@/services/open-content";
import type { ContentEntityReference } from "@tau/db-schema/content-identities";

import { projectCardListTranslator } from "../../i18n";

interface IProjectCardExtensionProps {
  element: ProjectCardListElement;
  attributes: RenderElementProps["attributes"];
  children: React.ReactNode;
}

const ProjectListSlate = (props: IProjectCardExtensionProps) => {
  const { attributes, children, element } = props;

  const onClickItem = async (
    item: ProjectItem,
    _index: number,
    reference?: ContentEntityReference
  ) => {
    try {
      await openContent("project-item", item.id, reference);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : projectCardListTranslator.t("open.failed")
      );
    }
  };

  const { projectItemId } = element;

  return (
    <div className="relative">
      <ProjectList
        projectItemId={projectItemId}
        reference={element.entityRef}
        onClick={onClickItem}
      />
      <div {...attributes}>{children}</div>
      <AddParagraph element={element} />
    </div>
  );
};

export default ProjectListSlate;
