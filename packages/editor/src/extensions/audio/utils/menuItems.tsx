import { Trash2 } from "lucide-react";
import { Editor, Transforms } from "slate";

import { BuildMenuParams, ContextMenuItem } from "../../../components/EditorContextMenu/types";
import type { AudioElement } from "../../../types";

export function buildAudioMenuItems(params: BuildMenuParams<AudioElement>): ContextMenuItem[] {
  const { editor, path } = params;

  const menuItems: ContextMenuItem[] = [
    {
      key: "delete",
      label: "删除",
      icon: <Trash2 size={16} />,
      danger: true,
      onSelect: () => {
        Editor.withoutNormalizing(editor, () => {
          Transforms.delete(editor, {
            at: path,
          });
          Transforms.insertNodes(
            editor,
            {
              type: "paragraph",
              children: [{ type: "formatted", text: "" }],
            },
            {
              at: path,
              select: true,
            }
          );
        });
      },
    },
  ];

  return menuItems;
}
