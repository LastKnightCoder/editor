import { AlignCenter, AlignLeft, AlignRight, Trash2 } from "lucide-react";
import { Transforms } from "slate";

import {
  BuildMenuParams,
  ContextMenuItem,
} from "../../../components/EditorContextMenu/types";
import type { VideoElement } from "../../types";

export function buildVideoMenuItems(
  params: BuildMenuParams<VideoElement>,
): ContextMenuItem[] {
  const { element, editor, path } = params;
  const currentAlign = element.align || "center";

  const menuItems: ContextMenuItem[] = [
    {
      key: "align",
      label: "对齐方式",
      icon:
        currentAlign === "left" ? (
          <AlignLeft size={16} />
        ) : currentAlign === "right" ? (
          <AlignRight size={16} />
        ) : (
          <AlignCenter size={16} />
        ),
      children: [
        {
          key: "align-left",
          label: "左对齐",
          icon: <AlignLeft size={16} />,
          disabled: currentAlign === "left",
          onSelect: () => {
            Transforms.setNodes(editor, { align: "left" as const }, { at: path });
          },
        },
        {
          key: "align-center",
          label: "居中",
          icon: <AlignCenter size={16} />,
          disabled: currentAlign === "center",
          onSelect: () => {
            Transforms.setNodes(
              editor,
              { align: "center" as const },
              { at: path },
            );
          },
        },
        {
          key: "align-right",
          label: "右对齐",
          icon: <AlignRight size={16} />,
          disabled: currentAlign === "right",
          onSelect: () => {
            Transforms.setNodes(
              editor,
              { align: "right" as const },
              { at: path },
            );
          },
        },
      ],
    },
    {
      key: "delete",
      label: "删除",
      icon: <Trash2 size={16} />,
      danger: true,
      onSelect: () => {
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
          },
        );
      },
    },
  ];

  return menuItems;
}

