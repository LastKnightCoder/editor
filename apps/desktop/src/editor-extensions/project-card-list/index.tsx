import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/src";
import type { ProjectCardListElement } from "./types";

import ProjectListSlate from "./components/ProjectListSlate";
import blockPanelItems from "./block-panel-items";
export type { ProjectCardListElement } from "./types";

export const createProjectCardListExtension = (projectId?: number) =>
  defineExtension({
    id: "host.project-card-list",
    elements: [
      defineElement<ProjectCardListElement>({
        type: "project-card-list",
        kind: "block",
        isVoid: true,
        render: ({ attributes, element, children }: ElementRenderProps<ProjectCardListElement>) => (
          <ProjectListSlate element={element} attributes={attributes}>
            {children}
          </ProjectListSlate>
        ),
        drag: true,
      }),
    ],
    blockPanel: blockPanelItems(projectId),
  });
