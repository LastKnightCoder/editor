import { invoke, off, on } from "@/electron";
import type {
  ComposeBoard,
  ComposeBoardSummary,
  GatherInput,
  GatherPhase,
  GatherResult,
} from "@/types/compose";
import { withModule } from "./module-init";

/** 正文的素材板；从没进过创作模式为 null */
export function getComposeBoard(contentId: number) {
  return invoke<ComposeBoard | null>("compose-board:get", contentId);
}

/** 素材板上有几份资料；没有素材板为 null */
export function getComposeBoardSummary(contentId: number) {
  return invoke<ComposeBoardSummary | null>("compose-board:summary", contentId);
}

/** 第一次进入创作模式时建板（已有原样返回） */
export function ensureComposeBoard(contentId: number, intent: string) {
  return invoke<ComposeBoard>("compose-board:ensure", contentId, intent);
}

export function setComposeIntent(contentId: number, intent: string) {
  return invoke<ComposeBoard | null>("compose-board:set-intent", contentId, intent);
}

/** 记下用户移走的召集资料（entityRefKey） */
export function dismissComposeItems(contentId: number, keys: string[]) {
  return invoke<ComposeBoard | null>("compose-board:dismiss", contentId, keys);
}

/** 召集一次（同一份正文同时只跑一次） */
export function gatherComposeMaterials(input: GatherInput) {
  return withModule("compose-gather", () => invoke<GatherResult>("compose:gather", input));
}

export function cancelComposeGather(contentId: number) {
  return withModule("compose-gather", () => invoke<boolean>("compose:cancel", contentId));
}

export function onComposeGatherPhase(listener: (phase: GatherPhase) => void) {
  const handler = (_event: unknown, phase: GatherPhase) => listener(phase);
  on("compose:gather-phase", handler);
  return () => off("compose:gather-phase", handler);
}

/** 段落与白板上各份资料（entityRefKey）的相似度；threshold 为空时不判断 */
export function composeParagraphSimilarity(text: string, keys: string[]) {
  return withModule("compose-gather", () =>
    invoke<{ scores: Array<{ key: string; similarity: number }>; threshold: number | null }>(
      "compose:paragraph-similarity",
      { text, keys }
    )
  );
}
