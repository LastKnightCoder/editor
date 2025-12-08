import { Descendant } from "slate";

export type SlideStorageMode = "reference" | "embedded";

// Slide 分组
export interface SlideGroup {
  id: number;
  name: string;
  parentId: number | null;
  orderIndex: number;
  createTime: number;
  updateTime: number;
}

export interface CreateSlideGroup {
  name: string;
  parentId?: number | null;
  orderIndex?: number;
}

export interface UpdateSlideGroup {
  id: number;
  name?: string;
  parentId?: number | null;
  orderIndex?: number;
}

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
  groupId?: number | null;
}

export type SlidePageTheme = "auto" | "light" | "dark";

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
  /** 页面主题：auto 跟随系统，light 浅色，dark 深色 */
  theme?: SlidePageTheme;
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
  groupId?: number | null;
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
  theme?: SlidePageTheme;
  styleOverride?: Record<string, any>;
  transitionConfig?: TransitionConfig;
  version?: string;
  thumbnail?: string;
}

export interface UpdateSlidePage extends Partial<Omit<CreateSlidePage, 'background'>> {
  id: number;
  deleted?: boolean;
  /** 背景设置，传 null 表示清除背景 */
  background?: SlideBackground | null;
}

export interface CreateSlideAsset {
  deckId: number;
  assetType: SlideAssetType;
  assetUrl: string;
  localPath?: string;
}
