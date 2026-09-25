/**
 * 预览框动作通道（D-057）：渲染器在内容组件里声明专属工具 / 更多菜单 / 缩放，
 * 预览框统一画进头部与右下浮控。声明按「签名」发布（标签、禁用态、缩放百分比），
 * 回调走 ref 取最新，渲染器每次渲染新建数组也不会引起重复发布。
 * 同一预览里可有多处声明（如渲染器声明更多菜单、ZoomSurface 声明缩放），按来源分别登记后合并。
 */

import {
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  type MutableRefObject,
} from "react";
import type { LucideIcon } from "lucide-react";

export interface PreviewAction {
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void | Promise<void>;
  disabled?: boolean;
  /** 开关型工具的按下态（如移动端预览） */
  active?: boolean;
}

export interface PreviewZoom {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  /** 当前缩放百分比；不提供则浮控只显示按钮 */
  percent?: number;
}

export interface PreviewActionSpec {
  tools?: PreviewAction[];
  more?: PreviewAction[];
  zoom?: PreviewZoom;
}

export interface PublishedActions {
  sig: string;
  ref: MutableRefObject<PreviewActionSpec>;
}

export type PublishPreviewActions = (source: string, entry: PublishedActions | null) => void;

/** 合并各来源的声明：工具 / 菜单按登记顺序拼接，缩放取最后一个声明者 */
export function mergePreviewActions(entries: Iterable<PublishedActions>): PreviewActionSpec {
  const merged: Required<Pick<PreviewActionSpec, "tools" | "more">> & PreviewActionSpec = {
    tools: [],
    more: [],
  };
  for (const { ref } of entries) {
    merged.tools.push(...(ref.current.tools ?? []));
    merged.more.push(...(ref.current.more ?? []));
    if (ref.current.zoom) merged.zoom = ref.current.zoom;
  }
  return merged;
}

export const PreviewActionsContext = createContext<PublishPreviewActions | null>(null);

const signature = (spec: PreviewActionSpec) =>
  JSON.stringify([
    spec.tools?.map(a => [a.key, a.label, a.disabled, a.active]),
    spec.more?.map(a => [a.key, a.label, a.disabled]),
    spec.zoom ? (spec.zoom.percent ?? true) : null,
  ]);

export function usePreviewActions(spec: PreviewActionSpec) {
  const publish = useContext(PreviewActionsContext);
  const source = useId();
  const latest = useRef(spec);
  latest.current = spec;
  const sig = signature(spec);
  useLayoutEffect(() => {
    publish?.(source, { sig, ref: latest });
  }, [publish, source, sig]);
  useLayoutEffect(() => () => publish?.(source, null), [publish, source]);
}
