/**
 * 宿主对文档卡的定制：嵌白板的页面（如创作模式）经 Provider 给出，白板本身不认识这些宿主。
 * - allowDock：阅读纸能否停靠右侧（右侧被正文占着时关掉，只居中）；
 * - cardAccessory：叠在文档卡上的宿主内容（抓手、已引用、亮起），需要交互的部分自行带 CANVAS_OVERLAY_ATTR；
 * - shelf：画布左侧可以开素材架（白板页面开；嵌在正文里的白板、创作模式不开）。
 */

import { createContext, useContext, type ReactNode } from "react";
import type { DocumentElement } from "@tau/whiteboard";

export interface DocumentHost {
  allowDock: boolean;
  cardAccessory?(element: DocumentElement): ReactNode;
  shelf?: boolean;
}

const DEFAULT_HOST: DocumentHost = { allowDock: true };

/** 白板页面（白板详情、单页画布）：能停靠，能开素材架 */
export const WHITEBOARD_PAGE_HOST: DocumentHost = { allowDock: true, shelf: true };

export const DocumentHostContext = createContext<DocumentHost>(DEFAULT_HOST);

export const useDocumentHost = () => useContext(DocumentHostContext);
