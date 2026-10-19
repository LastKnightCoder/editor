import { ChevronDown, FileText } from "lucide-react";
import { Transforms } from "slate";
import {
  createBlockConversionMenu,
  getCommandElementPath,
  type EditorCommand,
} from "@tau/editor/api";
const isType = (ctx: { element: { type?: unknown } }, ...types: readonly string[]) =>
  types.includes(ctx.element.type as string);
const sourceTypes: readonly string[] = ["paragraph", "blockquote", "callout", "highlight-block"];
export const conversionCommands: EditorCommand[] = [
  {
    id: "tau.transform.to.detail",
    run: (editor, ctx) => {
      if (!ctx.element || !sourceTypes.includes(ctx.element.type)) return;
      const path = getCommandElementPath(editor, ctx);
      if (!path) return;

      Transforms.setNodes(editor, { type: "detail" }, { at: path });
    },
  },
  {
    id: "tau.transform.detail.to-paragraph",
    run: (editor, ctx) => {
      if (ctx.element?.type !== "detail") return;
      const path = getCommandElementPath(editor, ctx);
      if (path) Transforms.unwrapNodes(editor, { at: path });
    },
  },
];
export const conversionMenuFor = {
  ...createBlockConversionMenu(sourceTypes, [
    {
      order: 60,
      id: "tau.transform.detail",
      title: "详情块",
      icon: <ChevronDown size={16} />,
      command: "tau.transform.to.detail",
      payload: { target: "detail" },
      when: ctx => !isType(ctx, "detail"),
    },
  ]),
  ...createBlockConversionMenu(
    ["detail"],
    [
      {
        order: 10,
        id: "tau.transform.paragraph",
        title: "段落",
        icon: <FileText size={16} />,
        command: "tau.transform.detail.to-paragraph",
        payload: { target: "paragraph" },
      },
    ]
  ),
};
