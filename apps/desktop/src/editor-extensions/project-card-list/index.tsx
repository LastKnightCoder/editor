import { Base } from "@tau/editor/src";
import { IExtension } from "@tau/editor/src";
import type { ProjectCardListElement } from "./types";

import ProjectListSlate from "./components/ProjectListSlate";
import { overwrite } from "./plugins";
import blockPanelItems from "./block-panel-items";
import { RenderElementProps } from "slate-react";
export type { ProjectCardListElement } from "./types";

class ProjectCardListExtension extends Base implements IExtension {
  type = "project-card-list";

  override dragSpec = true;
  private projectId?: number;

  constructor(projectId?: number) {
    super();
    this.projectId = projectId;
  }

  override getPlugins() {
    return [overwrite];
  }

  override getBlockPanelItems() {
    return blockPanelItems(this.projectId);
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;

    return (
      <ProjectListSlate element={element as any as ProjectCardListElement} attributes={attributes}>
        {children}
      </ProjectListSlate>
    );
  }
}

export default ProjectCardListExtension;
