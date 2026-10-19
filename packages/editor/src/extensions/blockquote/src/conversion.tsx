import { Quote, FileText } from "lucide-react";
import { Transforms } from "slate";
import {
  createBlockConversionMenu,
  getCommandElementPath,
  type EditorCommand,
} from "@tau/editor/api";
const isType = (ctx: { element: { type?: unknown } }, ...types: readonly string[]) =>
  types.includes(ctx.element.type as string);
const sourceTypes: readonly string[] = ["paragraph", "callout", "highlight-block"];
export const conversionCommands: EditorCommand[] = [
  {
    id: "tau.transform.to.blockquote",
    run: (editor, ctx) => {
      if (!ctx.element || !sourceTypes.includes(ctx.element.type)) return;
      const path = getCommandElementPath(editor, ctx);
      if (!path) return;

      Transforms.setNodes(editor, { type: "blockquote" }, { at: path });
    },
  },
  {
    id: "tau.transform.blockquote.to-paragraph",
    run: (editor, ctx) => {
      if (ctx.element?.type !== "blockquote") return;
      const path = getCommandElementPath(editor, ctx);
      if (path) Transforms.unwrapNodes(editor, { at: path });
    },
  },
];
export const conversionMenuFor = {
  ...createBlockConversionMenu(sourceTypes, [
    {
      order: 80,
      id: "tau.transform.blockquote",
      title: "引用块",
      icon: <Quote size={16} />,
      command: "tau.transform.to.blockquote",
      payload: { target: "blockquote" },
      when: ctx => isType(ctx, "paragraph", "callout", "highlight-block"),
    },
  ]),
  ...createBlockConversionMenu(
    ["blockquote"],
    [
      {
        order: 10,
        id: "tau.transform.paragraph",
        title: "段落",
        icon: <FileText size={16} />,
        command: "tau.transform.blockquote.to-paragraph",
        payload: { target: "paragraph" },
      },
    ]
  ),
};
