/**
 * 从笔记正文里取出时间点：时间戳 / 截帧节点，所在块是引用块即「摘录」。
 * 供播放器进度条刻度与转录「已摘录」底色使用，不另存数据。
 */

import { Node, type Descendant } from "slate";

export interface NoteMarker {
  id: string;
  /** 秒 */
  time: number;
  kind: "timestamp" | "quote" | "screenshot";
  /** 所在段落文字（摘录即原句），截帧取说明 */
  text: string;
  noteId: number;
  noteTitle: string;
}

const SNIPPET_MAX = 80;
const snippet = (text: string) => {
  const clean = text
    .replace(/\uFEFF/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > SNIPPET_MAX ? `${clean.slice(0, SNIPPET_MAX)}…` : clean;
};

type MarkerNode = { type?: string; time?: unknown; caption?: unknown; children?: Descendant[] };

export function extractNoteMarkers(
  content: Descendant[] | undefined,
  note: { id: number; title: string }
): NoteMarker[] {
  const markers: NoteMarker[] = [];
  const walk = (
    nodes: Descendant[] | undefined,
    path: number[],
    inQuote: boolean,
    block: Descendant | null
  ) => {
    nodes?.forEach((node, index) => {
      const element = node as MarkerNode;
      const here = [...path, index];
      const id = `${note.id}:${here.join(".")}`;
      if (element.type === "video-timestamp" && typeof element.time === "number") {
        markers.push({
          id,
          time: element.time,
          kind: inQuote ? "quote" : "timestamp",
          text: snippet(block ? Node.string(block) : ""),
          noteId: note.id,
          noteTitle: note.title,
        });
        return;
      }
      if (element.type === "video-screenshot" && typeof element.time === "number") {
        markers.push({
          id,
          time: element.time,
          kind: "screenshot",
          text: snippet(typeof element.caption === "string" ? element.caption : ""),
          noteId: note.id,
          noteTitle: note.title,
        });
        return;
      }
      if (element.children) {
        const isBlock = element.type !== undefined && element.type !== "formatted";
        walk(
          element.children,
          here,
          inQuote || element.type === "blockquote",
          isBlock ? node : block
        );
      }
    });
  };
  walk(content, [], false, null);
  return markers.sort((a, b) => a.time - b.time);
}

/** 已摘录的转录句：段起点与摘录时间戳相差不到 1 秒 */
export function quotedSegmentIndexes(
  markers: NoteMarker[],
  segments: Array<{ start: number }> | undefined
): Set<number> {
  const result = new Set<number>();
  if (!segments?.length) return result;
  for (const marker of markers) {
    if (marker.kind !== "quote") continue;
    const ms = marker.time * 1000;
    const index = segments.findIndex(segment => Math.abs(segment.start - ms) < 1000);
    if (index >= 0) result.add(index);
  }
  return result;
}
