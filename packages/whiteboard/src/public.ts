import Board from "./Board";
import type { WhiteboardAPI, WhiteboardExtension, WhiteboardSnapshot } from "./extensions/api";
import { resolveBoardAccess } from "./extensions/access";
import { BoardUtil as InternalBoardUtil } from "./utils/BoardUtil";
import { ViewPortTransforms as InternalViewport } from "./transforms";
import { ImageUtil as InternalImage } from "./utils/ImageUtil";
import { VideoUtil as InternalVideo } from "./utils/VideoUtil";
import { AudioUtil as InternalAudio } from "./utils/AudioUtil";
import type { BoardElement, Point } from "./types";
import { buildPlacement, layoutRow } from "./utils/placeElements";
import { DOCUMENT_DEFAULT_SIZE, type DocumentElement } from "./plugins/DocumentPlugin";
import { EXCERPT_DEFAULT_SIZE, type ExcerptElement } from "./plugins/ExcerptPlugin";
import { v4 as uuid } from "uuid";
import type { MediaCapabilities } from "./extensions/media";
import { FrameUtil as InternalFrame } from "./utils/FrameUtil";
import { PointUtil as InternalPoint } from "./utils/PointUtil";
import { MindUtil as InternalMind } from "./utils/MindUtil";

export const FrameUtil = { createFrame: InternalFrame.createFrame.bind(InternalFrame) };
export const PointUtil = {
  getResizePointFromRect: InternalPoint.getResizePointFromRect.bind(InternalPoint),
};
export const MindUtil = {
  findNodeInTree: InternalMind.findNodeInTree.bind(InternalMind),
  getChildrenByNode: InternalMind.getChildrenByNode.bind(InternalMind),
  layout: InternalMind.layout.bind(InternalMind),
  toggleFold: InternalMind.toggleFold.bind(InternalMind),
};

/** 无界面会话供导入、测试及命令使用；生命周期与只读控制归宿主。 */
export function createWhiteboardSession(
  snapshot: WhiteboardSnapshot,
  extensions: readonly WhiteboardExtension[] = []
) {
  const board = new Board(
    snapshot.children,
    snapshot.viewPort,
    snapshot.selection,
    [],
    snapshot.presentationSequences,
    false,
    snapshot.sketch
  );
  board.installExtensions(extensions);
  board.setActive(true);
  const api = board.extensions?.api;
  if (!api) throw new Error("白板扩展装配失败：api 不可用");
  return {
    api,
    setReadonly(value: boolean) {
      board.readonly = value;
    },
    setActive(value: boolean) {
      board.setActive(value);
    },
    dispose() {
      board.destroy();
    },
  };
}

export const BoardUtil = {
  getElementById: (api: WhiteboardAPI, id: string) => api.getElement(id) ?? null,
  diffNodePatchOnly: InternalBoardUtil.diffNodePatchOnly.bind(InternalBoardUtil),
};
export const PathUtil = {
  getPathByElement(api: WhiteboardAPI, element: BoardElement): number[] | null {
    const visit = (nodes: BoardElement[], parent: number[]): number[] | null => {
      for (let index = 0; index < nodes.length; index++) {
        const path = [...parent, index];
        if (nodes[index].id === element.id) return path;
        const child = visit(nodes[index].children ?? [], path);
        if (child) return child;
      }
      return null;
    };
    return visit(api.children, []);
  },
};
export const ViewPortTransforms = {
  centerElementsIfNotInViewPort: (
    api: WhiteboardAPI,
    ...args: Parameters<typeof InternalViewport.centerElementsIfNotInViewPort> extends [
      unknown,
      ...infer Rest,
    ]
      ? Rest
      : never
  ) => InternalViewport.centerElementsIfNotInViewPort(resolveBoardAccess(api), ...args),
  fitAllElements: (
    api: WhiteboardAPI,
    ...args: Parameters<typeof InternalViewport.fitAllElements> extends [unknown, ...infer Rest]
      ? Rest
      : never
  ) => InternalViewport.fitAllElements(resolveBoardAccess(api), ...args),
  moveViewPort: (
    api: WhiteboardAPI,
    ...args: Parameters<typeof InternalViewport.moveViewPort> extends [unknown, ...infer Rest]
      ? Rest
      : never
  ) => InternalViewport.moveViewPort(resolveBoardAccess(api), ...args),
};
export const ImageUtil = {
  insertImage: (file: File, api: WhiteboardAPI, media: MediaCapabilities) =>
    InternalImage.insertImage(file, resolveBoardAccess(api), media),
  insertImageFromPath: (path: string, api: WhiteboardAPI) =>
    InternalImage.insertImageFromPath(path, resolveBoardAccess(api)),
};
export const VideoUtil = {
  insertVideo: (file: File, api: WhiteboardAPI, media: MediaCapabilities) =>
    InternalVideo.insertVideo(file, resolveBoardAccess(api), media),
  insertVideoFromUrl: (url: string, api: WhiteboardAPI) =>
    InternalVideo.insertVideoFromUrl(url, resolveBoardAccess(api)),
  insertVideoFromMeta: (
    api: WhiteboardAPI,
    meta: Parameters<typeof InternalVideo.insertVideoFromMeta>[1],
    pageUrl: string
  ) => InternalVideo.insertVideoFromMeta(resolveBoardAccess(api), meta, pageUrl),
};
export const AudioUtil = {
  insertAudio: (file: File, api: WhiteboardAPI, media: MediaCapabilities) =>
    InternalAudio.insertAudio(file, resolveBoardAccess(api), media),
  insertAudioFromUrl: (url: string, api: WhiteboardAPI) =>
    InternalAudio.insertAudioFromUrl(url, resolveBoardAccess(api)),
  insertAudioFromTTS: (blob: Blob, text: string, api: WhiteboardAPI, media: MediaCapabilities) =>
    InternalAudio.insertAudioFromTTS(blob, text, resolveBoardAccess(api), media),
};

/**
 * 把一组文档放到白板：从 at 起排成一行（align 为 center 时以 at 为中心），可选从 linkFrom 连箭头，选中新卡。
 * 插入、连线与选中是一次 apply（一步撤销）。返回新元素；linkFrom 已不存在时不连线。
 */
export function placeDocuments(
  api: WhiteboardAPI,
  documents: readonly Pick<DocumentElement, "entityRef" | "entity" | "title">[],
  options: {
    at: Point;
    align?: "start" | "center";
    linkFrom?: string;
    /** 保留当前选中（长出相关：放入建议后还要继续看这张卡的其他建议） */
    keepSelection?: boolean;
  }
): DocumentElement[] {
  if (documents.length === 0) return [];
  const board = resolveBoardAccess(api);
  const sizes = documents.map(item => DOCUMENT_DEFAULT_SIZE[item.entityRef?.kind ?? "article"]);
  const boxes = layoutRow(options.at, sizes, options.align);
  const elements = documents.map((item, index): DocumentElement => ({
    id: uuid(),
    type: "document",
    ...item,
    ...boxes[index],
  }));
  const linkFrom = options.linkFrom
    ? InternalBoardUtil.getElementById(board, options.linkFrom)
    : null;
  board.apply(
    buildPlacement({
      elements,
      index: board.children.length,
      selection: board.selection,
      linkFrom,
      keepSelection: options.keepSelection,
    })
  );
  return elements;
}

/**
 * 放一张摘录：at 为左缘中点（align center 时为中心）；linkFrom 存在时从来源卡画一条虚线箭头。
 * 插入、连线与选中是一次 apply。返回新元素。
 */
export function placeExcerpt(
  api: WhiteboardAPI,
  excerpt: Pick<ExcerptElement, "source" | "quote" | "note" | "color" | "sourceTitle">,
  options: { at: Point; align?: "start" | "center"; linkFrom?: string }
): ExcerptElement {
  const board = resolveBoardAccess(api);
  const [box] = layoutRow(options.at, [EXCERPT_DEFAULT_SIZE], options.align);
  const element: ExcerptElement = { id: uuid(), type: "excerpt", ...excerpt, ...box };
  const linkFrom = options.linkFrom
    ? InternalBoardUtil.getElementById(board, options.linkFrom)
    : null;
  board.apply(
    buildPlacement({
      elements: [element],
      index: board.children.length,
      selection: board.selection,
      linkFrom,
      dashedLink: true,
    })
  );
  return element;
}
