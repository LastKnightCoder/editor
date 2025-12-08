import { Descendant } from "slate";

export type SlideStorageMode = "reference" | "embedded";

export interface SlideDeckMetadata {
  storageMode: SlideStorageMode;
  [key: string]: any;
}

export interface SlideTheme {
  id: string;
  name: string;
  background: SlideBackground;
  colors: {
    primary: string;
    secondary: string;
    text: string;
    textSecondary: string;
    accent: string;
  };
  fonts?: {
    heading: string;
    body: string;
    code: string;
  };
  codeTheme?: string;
}

export interface SlideBackground {
  type: "image";
  value: string;
}

export interface TransitionConfig {
  type: "none" | "fade" | "slide" | "zoom" | "flip";
  direction?: "left" | "right" | "up" | "down";
  duration: number;
}

export interface SlideDeck {
  id: number;
  createTime: number;
  updateTime: number;
  title: string;
  description?: string;
  tags: string[];
  width: number;
  height: number;
  baseFontScale: number;
  themeId?: string;
  themeConfig?: SlideTheme;
  pageIds: number[];
  metadata: SlideDeckMetadata;
  thumbnail?: string;
  deleted: boolean;
}

export interface SlidePage {
  id: number;
  deckId: number;
  createTime: number;
  updateTime: number;
  pageIndex: number;
  contentId?: number;
  content?: Descendant[];
  speakerNotesContentId?: number;
  speakerNotes?: Descendant[];
  background?: SlideBackground;
  styleOverride?: Record<string, any>;
  transitionConfig?: TransitionConfig;
  version?: string;
  thumbnail?: string;
  deleted: boolean;
}

export type SlideAssetType = "image" | "video" | "audio" | "font" | "other";

export interface SlideAsset {
  id: number;
  deckId: number;
  assetType: SlideAssetType;
  assetUrl: string;
  localPath?: string;
  createTime: number;
}

export interface CreateSlideDeck {
  title: string;
  description?: string;
  tags?: string[];
  width?: number;
  height?: number;
  baseFontScale?: number;
  themeId?: string;
  themeConfig?: SlideTheme;
  metadata?: Partial<SlideDeckMetadata>;
  thumbnail?: string;
}

export interface UpdateSlideDeck extends Partial<CreateSlideDeck> {
  id: number;
  deleted?: boolean;
  pageIds?: number[];
}

export interface CreateSlidePage {
  deckId: number;
  pageIndex?: number;
  content?: Descendant[];
  speakerNotes?: Descendant[];
  background?: SlideBackground;
  styleOverride?: Record<string, any>;
  transitionConfig?: TransitionConfig;
  version?: string;
  thumbnail?: string;
}

export interface UpdateSlidePage extends Partial<CreateSlidePage> {
  id: number;
  deleted?: boolean;
}

export interface CreateSlideAsset {
  deckId: number;
  assetType: SlideAssetType;
  assetUrl: string;
  localPath?: string;
}
