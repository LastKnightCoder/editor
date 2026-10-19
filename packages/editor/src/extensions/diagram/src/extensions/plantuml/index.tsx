import loadable from "@loadable/component";

import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";

import type { PlantUMLElement } from "../../types/plantuml";
import blockPanelItems from "./block-panel-items";

const PlantUMLBlock = loadable(() => import("./components/PlantUMLBlock.tsx"));

export interface PlantUMLExtensionOptions {
  /** PlantUML 渲染服务器地址，默认 https://www.plantuml.com/plantuml */
  server?: string;
  /** 暗色时注入的 !theme（置空串禁用），默认 cyborg-outline */
  darkTheme?: string;
}

export const createPlantUMLExtension = (options: PlantUMLExtensionOptions = {}) =>
  defineExtension({
    id: "tau.plantuml",
    elements: [
      defineElement<PlantUMLElement>({
        type: "plantuml",
        kind: "block",
        drag: true,
        isVoid: true,
        render: ({ attributes, element, children }: ElementRenderProps<PlantUMLElement>) => (
          <PlantUMLBlock
            element={element}
            attributes={attributes}
            server={options.server}
            darkTheme={options.darkTheme}
          >
            {children}
          </PlantUMLBlock>
        ),
      }),
    ],
    blockPanel: blockPanelItems,
  });

const plantUMLExtension = createPlantUMLExtension();
export default plantUMLExtension;
