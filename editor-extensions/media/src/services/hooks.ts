import { useService } from "@tau/editor/api";
import { IEditorSlots } from "./tokens";
import type { EditorSlots } from "./slots";

export function useEditorSlots(): EditorSlots {
  return useService(IEditorSlots);
}
