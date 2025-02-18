import { Descendant } from "slate";
import Base from "@/components/Editor/extensions/base.ts";
import IExtension from "@/components/Editor/extensions/types.ts";

import ProjectListSlate from "./components/ProjectListSlate";
import { overwrite } from './plugins';
import blockPanelItems from "./block-panel-items";
import { RenderElementProps } from "slate-react";

export interface ProjectCardListElement {
  type: 'project-card-list';
  projectItemId: number;
  children: Descendant[];
}

class ProjectCardListExtension extends Base implements IExtension {
  type = 'project-card-list';

  override getPlugins() {
    return [overwrite]
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;

    return (
      <ProjectListSlate element={element as any as ProjectCardListElement} attributes={attributes}>
        {children}
      </ProjectListSlate>
    )
  }
}

export default ProjectCardListExtension;
