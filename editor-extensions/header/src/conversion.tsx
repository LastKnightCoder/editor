import { Heading1, Heading2, Heading3, Heading4, Heading5, Heading6 } from "lucide-react";
import { Transforms } from "slate";
import {
  createBlockConversionMenu,
  getCommandElementPath,
  type EditorCommand,
} from "@tau/editor/api";
const isType = (ctx: { element: { type?: unknown } }, ...types: readonly string[]) =>
  types.includes(ctx.element.type as string);
const sourceTypes: readonly string[] = ["paragraph"];
export const conversionCommands: EditorCommand[] = [
  {
    id: "tau.transform.to.header",
    run: (editor, ctx) => {
      if (!ctx.element || !sourceTypes.includes(ctx.element.type)) return;
      const path = getCommandElementPath(editor, ctx);
      if (!path) return;
      const options =
        (ctx.payload as { options?: Record<string, unknown> } | undefined)?.options ?? {};
      if (typeof options !== "object" || Array.isArray(options)) return;
      const level = options.level ?? 1;
      if (typeof level !== "number" || !Number.isInteger(level) || level < 1 || level > 6) return;
      Transforms.setNodes(
        editor,
        { type: "header", level: level as 1 | 2 | 3 | 4 | 5 | 6 },
        { at: path }
      );
    },
  },
];
export const conversionMenuFor = {
  ...createBlockConversionMenu(sourceTypes, [
    {
      order: 20,
      id: "tau.transform.header",
      title: "标题",
      icon: <Heading1 size={16} />,
      children: ([1, 2, 3, 4, 5, 6] as const).map(level => ({
        id: `tau.transform.header-${level}`,
        title: `标题 ${level}`,
        icon:
          level === 1 ? (
            <Heading1 size={16} />
          ) : level === 2 ? (
            <Heading2 size={16} />
          ) : level === 3 ? (
            <Heading3 size={16} />
          ) : level === 4 ? (
            <Heading4 size={16} />
          ) : level === 5 ? (
            <Heading5 size={16} />
          ) : (
            <Heading6 size={16} />
          ),
        command: "tau.transform.to.header",
        payload: { target: "header", options: { level } },
        when: (ctx: { element: { type?: unknown } }) => isType(ctx, "paragraph"),
      })),
      when: ctx => isType(ctx, "paragraph"),
    },
  ]),
};
