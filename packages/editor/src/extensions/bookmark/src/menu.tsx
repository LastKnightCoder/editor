import {
  Check,
  Copy,
  ExternalLink,
  LayoutPanelTop,
  Minus,
  Pencil,
  PanelRight,
  RefreshCw,
} from "lucide-react";
import type { Element } from "slate";
import { IOpenerService } from "@tau/shared/host-services";
import { notifierOf, type EditorCommand, type EditorMenuEntry } from "@tau/editor/api";

import type { BookmarkAppearance, BookmarkElement } from "./types";
import { fetchBookmarkMeta, isBookmarkElement, setBookmarkFields } from "./operations";
import { openBookmarkEditor } from "./components/openBookmarkEditor";

const asBookmark = (element: Element | undefined): BookmarkElement | null =>
  isBookmarkElement(element) ? element : null;

const APPEARANCES: { value: BookmarkAppearance; title: string; icon: typeof PanelRight }[] = [
  { value: "row", title: "横向卡", icon: PanelRight },
  { value: "cover", title: "封面卡", icon: LayoutPanelTop },
  { value: "compact", title: "紧凑", icon: Minus },
];

export const bookmarkCommands: EditorCommand[] = [
  {
    id: "tau.bookmark.open",
    title: "打开网页",
    run: (editor, ctx) => {
      const element = asBookmark(ctx.element);
      if (!element) return;
      const opener = editor.tryGetService?.(IOpenerService);
      if (opener) void opener.open(element.url);
      else window.open(element.url, "_blank", "noopener,noreferrer");
    },
  },
  {
    id: "tau.bookmark.copy",
    title: "复制链接",
    run: async (editor, ctx) => {
      const element = asBookmark(ctx.element);
      if (!element) return;
      try {
        await navigator.clipboard.writeText(element.url);
        notifierOf(editor).success("已复制链接");
      } catch {
        notifierOf(editor).error("复制失败");
      }
    },
  },
  {
    id: "tau.bookmark.edit",
    title: "编辑",
    run: (editor, ctx) => {
      const element = asBookmark(ctx.element);
      if (element) openBookmarkEditor(editor, element);
    },
  },
  {
    id: "tau.bookmark.refresh",
    title: "重新读取网页信息",
    run: (editor, ctx) => {
      const element = asBookmark(ctx.element);
      if (element) return fetchBookmarkMeta(editor, element, { path: ctx.path });
    },
  },
  {
    id: "tau.bookmark.appearance",
    title: "外观",
    run: (editor, ctx) => {
      const element = asBookmark(ctx.element);
      const appearance = ctx.payload as BookmarkAppearance;
      if (!element || !APPEARANCES.some(item => item.value === appearance)) return;
      setBookmarkFields(editor, element, {
        appearance: appearance === "row" ? undefined : appearance,
      });
    },
  },
];

const current = (element: Element) => asBookmark(element)?.appearance ?? "row";

export const bookmarkMenuItems: EditorMenuEntry[] = [
  {
    id: "tau.bookmark.open",
    title: "打开网页",
    icon: <ExternalLink size={16} />,
    command: "tau.bookmark.open",
  },
  {
    id: "tau.bookmark.copy",
    title: "复制链接",
    icon: <Copy size={16} />,
    command: "tau.bookmark.copy",
  },
  {
    id: "tau.bookmark.edit",
    title: "编辑",
    icon: <Pencil size={16} />,
    command: "tau.bookmark.edit",
  },
  {
    id: "tau.bookmark.refresh",
    title: "重新读取网页信息",
    icon: <RefreshCw size={16} />,
    command: "tau.bookmark.refresh",
  },
  {
    id: "tau.bookmark.appearance",
    title: "外观",
    icon: <PanelRight size={16} />,
    children: APPEARANCES.map(item => ({
      id: `tau.bookmark.appearance.${item.value}`,
      title: item.title,
      icon: ctx =>
        current(ctx.element) === item.value ? <Check size={16} /> : <item.icon size={16} />,
      command: "tau.bookmark.appearance",
      payload: item.value,
    })),
  },
];
