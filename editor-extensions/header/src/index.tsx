import type {} from "./augmentations";
import type { Element } from "slate";
import { cn } from "@tau/ui";

import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";

import type { HeaderElement } from "./types";

import Header from "./components/Header";
import { LEVEL_FONT_SIZE } from "./components/Header/components";
import { headerBehaviors, headerForParagraph } from "./behaviors";
import { headerCommands, headerHotkeys } from "./commands";
import blockPanelItems from "./blockPanelItems";
import { conversionCommands, conversionMenuFor } from "./conversion";

export interface HeaderExtensionOptions {
  /** 禁用标题折叠：不显示折叠按钮，已折叠的标题按展开渲染 */
  disableCollapse?: boolean;
}

/**
 * 手柄比通用位置更靠左更宽：让出标题折叠箭头的位置（顶线对齐由块根的级别边距保证）。
 * 手柄挂在 wrapper 上、em 按正文字号算，故补上本级字号，偏移与尺寸才以标题 em 为准、与行盒等高。
 */
const handleClassName = (element: Element) => {
  const { level } = element as HeaderElement;
  const normalized = level >= 1 && level <= 6 ? level : 1;
  return cn(
    "-left-[2.7em] h-[1.5em] w-[1.5em] transition-opacity duration-200 [&>svg]:translate-y-0",
    LEVEL_FONT_SIZE[normalized],
    // h1 行高收紧为 1.3
    normalized === 1 && "h-[1.3em]"
  );
};

export const createHeaderExtension = (options: HeaderExtensionOptions = {}) => {
  const render = ({ attributes, element, children }: ElementRenderProps<HeaderElement>) => (
    <Header element={element} attributes={attributes} disableCollapse={options.disableCollapse}>
      {children}
    </Header>
  );

  return defineExtension({
    id: "tau.header",
    elements: [
      defineElement<HeaderElement>({
        type: "header",
        kind: "block",
        render,
        drag: {
          self: true,
          children: true,
          handleClassName,
        },
        behaviors: headerBehaviors,
      }),
    ],
    blockPanel: blockPanelItems,
    commands: [...headerCommands, ...conversionCommands],
    menuFor: conversionMenuFor,
    hotkeys: headerHotkeys,
    behaviorsFor: {
      paragraph: headerForParagraph,
    },
  });
};

const headerExtension = createHeaderExtension();
export default headerExtension;

export type { HeaderElement } from "./types";
export { insertHeader, resolveHeaderAnchor, scrollHeaderIntoView } from "./operations";
