import type { Descendant } from "slate";
export type SliderBlockKind =
  | "flow-editor"
  | "absolute-editor"
  | "image"
  | "shape";

export interface SliderDeck {
  id: number;
  title: string;
  description: string;
  tags: string[];
  snapshot: string;
  templateSetId: number | null;
  createTime: number;
  updateTime: number;
}

export type ICreateSliderDeck = Omit<
  SliderDeck,
  "id" | "createTime" | "updateTime"
>;
export type IUpdateSliderDeck = Omit<SliderDeck, "createTime" | "updateTime">;

export interface SliderPageBackground {
  color?: string;
  image?: string;
  size?: "cover" | "contain" | "auto";
  position?: string;
}

export interface SliderPage {
  id: number;
  deckId: number;
  name: string;
  orderIndex: number;
  background: SliderPageBackground;
  templateId: number | null;
  createTime: number;
  updateTime: number;
}

export type ICreateSliderPage = Omit<
  SliderPage,
  "id" | "createTime" | "updateTime"
>;
export type IUpdateSliderPage = Omit<SliderPage, "createTime" | "updateTime">;

export interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex?: number;
}

export interface SliderEditorBlock {
  id: number;
  pageId: number;
  kind: SliderBlockKind;
  contentId: number | null;
  geometry: Geometry | null;
  style: Record<string, unknown> | null;
  orderIndex: number;
  createTime: number;
  updateTime: number;
}

export type ICreateSliderEditorBlock = Omit<
  SliderEditorBlock,
  "id" | "createTime" | "updateTime"
>;
export type IUpdateSliderEditorBlock = Partial<
  Omit<SliderEditorBlock, "createTime" | "updateTime">
> & { id: number };

export interface SliderTemplateSet {
  id: number;
  key: string;
  name: string;
  description: string;
  theme: Record<string, unknown>;
  cover: string;
  createTime: number;
  updateTime: number;
}

export type ICreateSliderTemplateSet = Omit<
  SliderTemplateSet,
  "id" | "createTime" | "updateTime"
>;
export type IUpdateSliderTemplateSet = Omit<
  SliderTemplateSet,
  "createTime" | "updateTime"
>;

export interface SliderTemplate {
  id: number;
  setId: number;
  key: string;
  name: string;
  category: string;
  defaultPage: SliderPageBackground;
  defaultBlocks: Array<
    Pick<SliderEditorBlock, "kind" | "style" | "orderIndex"> & {
      geometry?: Geometry | null;
      initialContent?: Descendant[];
    }
  >;
  preview: string;
  createTime: number;
  updateTime: number;
}

export type ICreateSliderTemplate = Omit<
  SliderTemplate,
  "id" | "createTime" | "updateTime"
>;
export type IUpdateSliderTemplate = Omit<
  SliderTemplate,
  "createTime" | "updateTime"
>;
