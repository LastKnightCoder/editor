import { Highlighter, Circle, FileText } from "lucide-react";
import { Transforms } from "slate";
import {
  createBlockConversionMenu,
  getCommandElementPath,
  type EditorCommand,
} from "@tau/editor/api";
const isType = (ctx: { element: { type?: unknown } }, ...types: readonly string[]) =>
  types.includes(ctx.element.type as string);
const HIGHLIGHT_COLORS = [
  { value: "red", label: "红色", hex: "#ef4444" },
  { value: "orange", label: "橙色", hex: "#f97316" },
  { value: "yellow", label: "黄色", hex: "#eab308" },
  { value: "green", label: "绿色", hex: "#22c55e" },
  { value: "blue", label: "蓝色", hex: "#3b82f6" },
  { value: "purple", label: "紫色", hex: "#a855f7" },
] as const;
const sourceTypes: readonly string[] = ["paragraph", "blockquote", "callout", "detail"];
export const conversionCommands: EditorCommand[] = [
  {
    id: "tau.transform.to.highlight-block",
    run: (editor, ctx) => {
      if (!ctx.element || !sourceTypes.includes(ctx.element.type)) return;
      const path = getCommandElementPath(editor, ctx);
      if (!path) return;
      const options =
        (ctx.payload as { options?: Record<string, unknown> } | undefined)?.options ?? {};
      if (typeof options !== "object" || Array.isArray(options)) return;
      const color = options.color ?? "yellow";
      if (!HIGHLIGHT_COLORS.some(item => item.value === color)) return;
      Transforms.setNodes(
        editor,
        {
          type: "highlight-block",
          color: color as "red" | "orange" | "yellow" | "green" | "blue" | "purple",
        },
        { at: path }
      );
    },
  },
  {
    id: "tau.transform.highlight-block.to-paragraph",
    run: (editor, ctx) => {
      if (ctx.element?.type !== "highlight-block") return;
      const path = getCommandElementPath(editor, ctx);
      if (path) Transforms.unwrapNodes(editor, { at: path });
    },
  },
];
export const conversionMenuFor = {
  ...createBlockConversionMenu(sourceTypes, [
    {
      order: 50,
      id: "tau.transform.highlight-block",
      title: "高亮块",
      icon: <Highlighter size={16} />,
      children: HIGHLIGHT_COLORS.map(color => ({
        id: `tau.transform.highlight-${color.value}`,
        title: color.label,
        icon: <Circle size={16} style={{ fill: color.hex, color: color.hex }} />,
        command: "tau.transform.to.highlight-block",
        payload: { target: "highlight-block", options: { color: color.value } },
      })),
      when: ctx => !isType(ctx, "highlight-block"),
    },
  ]),
  ...createBlockConversionMenu(
    ["highlight-block"],
    [
      {
        order: 10,
        id: "tau.transform.paragraph",
        title: "段落",
        icon: <FileText size={16} />,
        command: "tau.transform.highlight-block.to-paragraph",
        payload: { target: "paragraph" },
      },
    ]
  ),
};
