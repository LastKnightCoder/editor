import { RefreshCw } from "lucide-react";
import type { EditorMenuContribution, EditorMenuEntry } from "../api/menu";

/** 只组合转换菜单的展示结构，源类型与具体转换由领域提供。 */
export function createBlockConversionMenu(
  sourceTypes: readonly string[],
  entries: readonly EditorMenuEntry[]
): Readonly<Record<string, EditorMenuContribution>> {
  const menu: EditorMenuContribution = [
    {
      id: "tau.transform",
      title: "转换成",
      icon: <RefreshCw size={16} />,
      group: "transform",
      mergeChildren: true,
      children: entries,
    },
  ];
  return Object.fromEntries(sourceTypes.map(type => [type, menu]));
}
