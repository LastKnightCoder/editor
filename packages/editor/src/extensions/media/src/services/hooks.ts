import { useOptionalService, useService } from "@tau/editor/api";
import { IEditorSlots, IMediaAppearance } from "./tokens";
import type { EditorSlots } from "./slots";
import { useImageAppearance } from "../extensions/image/appearanceOption";
import type { ImageAppearanceConfig } from "../extensions/image/utils/appearance";

export function useEditorSlots(): EditorSlots {
  return useService(IEditorSlots);
}

/** 读取当前编辑器作用域注册的媒体默认外观；来源变化时重渲染 */
export function useMediaAppearance(): ImageAppearanceConfig | undefined {
  return useImageAppearance(useOptionalService(IMediaAppearance));
}
