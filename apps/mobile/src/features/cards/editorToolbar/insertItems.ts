import { mobileEditorTranslator, editorAliases, type MobileEditorMessageKey } from "./i18n";
import {
  Camera,
  ChevronDown,
  CircleDot,
  FileAudio,
  FileSymlink,
  Globe,
  Highlighter,
  Image as ImageIcon,
  Info,
  Link2,
  Minus,
  PanelsTopLeft,
  Sigma,
  SquareCheck,
  SquareCode,
  Superscript,
  Table as TableIcon,
  Video,
  Volume2,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import type { InsertSheetItemKind } from "./useMobileEditorToolbarController";

export type InsertGroupKey = "basic" | "media" | "advanced" | "inline" | "plugin";

/** 色调序号，对应 tag-1 ~ tag-5 语义色 */
export type InsertTone = 1 | 2 | 3 | 4 | 5;

export type InsertItem = {
  kind: InsertSheetItemKind;
  label: string;
  /** 搜索关键词：中文别名、拼音全拼与首字母、英文 */
  keywords: string[];
  group: InsertGroupKey;
  icon: LucideIcon;
  tone: InsertTone;
  /** 插件贡献项的来源；内置项为空 */
  source?: { pluginId: string; name: string };
};

export type InsertGroup = {
  key: InsertGroupKey;
  title: string;
  tone: InsertTone;
};

export const INSERT_GROUPS: InsertGroup[] = [
  {
    key: "basic",
    get title() {
      return mobileEditorTranslator.t("insert.basic");
    },
    tone: 1,
  },
  {
    key: "media",
    get title() {
      return mobileEditorTranslator.t("media.title");
    },
    tone: 2,
  },
  {
    key: "advanced",
    get title() {
      return mobileEditorTranslator.t("insert.advanced");
    },
    tone: 4,
  },
  {
    key: "inline",
    get title() {
      return mobileEditorTranslator.t("insert.inline");
    },
    tone: 5,
  },
  {
    key: "plugin",
    get title() {
      return mobileEditorTranslator.t("insert.plugin");
    },
    tone: 3,
  },
];

// 需要展开选区的行内包裹（批注 / 样式文本 / 快捷键）不放插入面板：「+」只在折叠选区时可见，入口在格式模式与 Aa 面板
export const INSERT_ITEMS: InsertItem[] = [
  {
    kind: "check-list",
    get label() {
      return mobileEditorTranslator.t("block.todo");
    },
    keywords: ["任务列表", "daiban", "db", "renwuliebiao", "rwlb", "todo", "task", "checklist"],
    group: "basic",
    icon: SquareCheck,
    tone: 1,
  },
  {
    kind: "callout",
    get label() {
      return mobileEditorTranslator.t("block.callout");
    },
    keywords: ["提示", "tishikuai", "tsk", "callout", "info", "tip"],
    group: "basic",
    icon: Info,
    tone: 1,
  },
  {
    kind: "divider",
    get label() {
      return mobileEditorTranslator.t("block.divider");
    },
    keywords: ["分隔线", "fengexian", "fgx", "divider", "hr", "line"],
    group: "basic",
    icon: Minus,
    tone: 1,
  },
  {
    kind: "details",
    get label() {
      return mobileEditorTranslator.t("block.details");
    },
    keywords: ["折叠", "zhediekuai", "zdk", "details", "toggle", "collapse"],
    group: "basic",
    icon: ChevronDown,
    tone: 1,
  },
  {
    kind: "highlight-block",
    get label() {
      return mobileEditorTranslator.t("block.highlight");
    },
    keywords: ["gaoliangkuai", "glk", "highlight"],
    group: "basic",
    icon: Highlighter,
    tone: 1,
  },
  {
    kind: "tabs",
    get label() {
      return mobileEditorTranslator.t("block.tabs");
    },
    keywords: ["biaoqianye", "bqy", "tabs"],
    group: "basic",
    icon: PanelsTopLeft,
    tone: 1,
  },
  {
    kind: "image",
    get label() {
      return mobileEditorTranslator.t("media.photo");
    },
    keywords: ["相册", "图片", "zhaopian", "zp", "xiangce", "tupian", "tp", "photo", "image"],
    group: "media",
    icon: ImageIcon,
    tone: 2,
  },
  {
    kind: "camera",
    get label() {
      return mobileEditorTranslator.t("media.camera");
    },
    keywords: ["相机", "paizhao", "pz", "xiangji", "camera"],
    group: "media",
    icon: Camera,
    tone: 2,
  },
  {
    kind: "video",
    get label() {
      return mobileEditorTranslator.t("media.video");
    },
    keywords: ["shipin", "sp", "video"],
    group: "media",
    icon: Video,
    tone: 2,
  },
  {
    kind: "record",
    get label() {
      return mobileEditorTranslator.t("media.record");
    },
    keywords: ["录制", "录音笔", "luyin", "ly", "luzhi", "record", "recording", "voice memo"],
    group: "media",
    icon: CircleDot,
    tone: 2,
  },
  {
    kind: "audio",
    get label() {
      return mobileEditorTranslator.t("media.audioFile");
    },
    keywords: ["音频", "yinpin", "yp", "yinpinwenjian", "audio", "file"],
    group: "media",
    icon: FileAudio,
    tone: 2,
  },
  {
    kind: "tts",
    get label() {
      return mobileEditorTranslator.t("media.tts");
    },
    keywords: [
      "朗读",
      "配音",
      "语音合成",
      "wenzizhuanyuyin",
      "wzzyy",
      "langdu",
      "peiyin",
      "tts",
      "speech",
    ],
    group: "media",
    icon: Volume2,
    tone: 2,
  },
  {
    kind: "image-url",
    get label() {
      return mobileEditorTranslator.t("media.imageUrl");
    },
    keywords: ["wangluotupian", "wltp", "url", "image", "link"],
    group: "media",
    icon: Link2,
    tone: 2,
  },
  {
    kind: "video-url",
    get label() {
      return mobileEditorTranslator.t("media.videoUrl");
    },
    keywords: ["wangluoshipin", "wlsp", "url", "video", "link"],
    group: "media",
    icon: Link2,
    tone: 2,
  },
  {
    kind: "audio-url",
    get label() {
      return mobileEditorTranslator.t("media.audioUrl");
    },
    keywords: ["wangluoyinpin", "wlyp", "url", "audio", "link"],
    group: "media",
    icon: Link2,
    tone: 2,
  },
  {
    kind: "table",
    get label() {
      return mobileEditorTranslator.t("table.title");
    },
    keywords: ["biaoge", "bg", "table"],
    group: "advanced",
    icon: TableIcon,
    tone: 4,
  },
  {
    kind: "code-block",
    get label() {
      return mobileEditorTranslator.t("block.code");
    },
    keywords: ["代码", "daimakuai", "dmk", "code"],
    group: "advanced",
    icon: SquareCode,
    tone: 4,
  },
  {
    kind: "math",
    get label() {
      return mobileEditorTranslator.t("block.math");
    },
    keywords: ["数学", "gongshi", "gs", "math", "latex", "tex"],
    group: "advanced",
    icon: Sigma,
    tone: 4,
  },
  {
    kind: "mermaid",
    get label() {
      return mobileEditorTranslator.t("block.mermaid");
    },
    keywords: ["图表", "liuchengtu", "lct", "mermaid", "diagram", "flowchart"],
    group: "advanced",
    icon: Workflow,
    tone: 4,
  },
  {
    kind: "webview",
    get label() {
      return mobileEditorTranslator.t("block.web");
    },
    keywords: ["网页视图", "网站", "wangye", "wy", "wangzhan", "webview", "web", "iframe"],
    group: "advanced",
    icon: Globe,
    tone: 4,
  },
  {
    kind: "annotation",
    get label() {
      return mobileEditorTranslator.t("block.annotation");
    },
    keywords: ["注释", "zhujie", "zj", "zhushi", "annotation", "note"],
    group: "inline",
    icon: Superscript,
    tone: 5,
  },
  {
    kind: "content-link",
    get label() {
      return mobileEditorTranslator.t("link.content");
    },
    keywords: [
      "关联内容",
      "关联卡片",
      "yinyongneirong",
      "yynr",
      "guanlian",
      "link",
      "card",
      "article",
    ],
    group: "inline",
    icon: FileSymlink,
    tone: 5,
  },
];

/** 会拉起系统选择器或输入浮层的条目：插入时不弹回编辑器键盘 */
export const OVERLAY_INSERT_KINDS: ReadonlySet<InsertSheetItemKind> = new Set<InsertSheetItemKind>([
  "image",
  "camera",
  "video",
  "audio",
  "image-url",
  "video-url",
  "audio-url",
  "webview",
  "content-link",
  "tts",
]);

/** 空查询返回全部；否则按 label 或任一关键词包含查询词过滤（大小写不敏感），保持原顺序 */
export function searchInsertItems<T extends Pick<InsertItem, "label" | "keywords">>(
  items: readonly T[],
  query: string
): T[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...items];
  return items.filter(
    item =>
      item.label.toLowerCase().includes(normalized) ||
      item.keywords.some(keyword => keyword.toLowerCase().includes(normalized))
  );
}

export const RECENT_INSERT_STORAGE_KEY = "mobile-editor-recent-insert";
export const RECENT_INSERT_LIMIT = 4;

const KNOWN_INSERT_KINDS = new Set<string>(INSERT_ITEMS.map(item => item.kind));

function isKnownInsertKind(value: unknown): value is InsertSheetItemKind {
  return typeof value === "string" && KNOWN_INSERT_KINDS.has(value);
}

/** 最近使用的插入条目，最新在前；存储损坏或含未知条目时忽略对应部分 */
export function readRecentInsertKinds(): InsertSheetItemKind[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(localStorage.getItem(RECENT_INSERT_STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const kinds = parsed.filter(isKnownInsertKind);
  return Array.from(new Set(kinds)).slice(0, RECENT_INSERT_LIMIT);
}

/** 记录一次使用并返回更新后的列表（去重、最新在前、最多 RECENT_INSERT_LIMIT 个） */
export function pushRecentInsertKind(kind: InsertSheetItemKind): InsertSheetItemKind[] {
  const next = [kind, ...readRecentInsertKinds().filter(item => item !== kind)].slice(
    0,
    RECENT_INSERT_LIMIT
  );
  try {
    localStorage.setItem(RECENT_INSERT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 存储不可用时只影响最近使用的持久化
  }
  return next;
}

const INSERT_LABEL_KEYS: Partial<Record<InsertSheetItemKind, MobileEditorMessageKey>> = {
  "check-list": "block.todo",
  callout: "block.callout",
  divider: "block.divider",
  details: "block.details",
  "highlight-block": "block.highlight",
  tabs: "block.tabs",
  image: "media.photo",
  camera: "media.camera",
  video: "media.video",
  record: "media.record",
  audio: "media.audioFile",
  tts: "media.tts",
  "image-url": "media.imageUrl",
  "video-url": "media.videoUrl",
  "audio-url": "media.audioUrl",
  table: "table.title",
  "code-block": "block.code",
  math: "block.math",
  mermaid: "block.mermaid",
  webview: "block.web",
  annotation: "block.annotation",
  "content-link": "link.content",
};
for (const item of INSERT_ITEMS) {
  const key = INSERT_LABEL_KEYS[item.kind];
  if (key) item.keywords.push(...editorAliases(key));
}
