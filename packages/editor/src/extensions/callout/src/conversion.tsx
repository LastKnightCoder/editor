import { MessageSquare, Info, Lightbulb, AlertTriangle, AlertCircle, FileText } from "lucide-react";
import { Transforms } from "slate";
import {
  createBlockConversionMenu,
  getCommandElementPath,
  type EditorCommand,
} from "@tau/editor/api";
const isType = (ctx: { element: { type?: unknown } }, ...types: readonly string[]) =>
  types.includes(ctx.element.type as string);
const CALLOUT_TYPES = [
  { value: "info", label: "信息", title: "信息" },
  { value: "tip", label: "提示", title: "提示" },
  { value: "warning", label: "警告", title: "警告" },
  { value: "danger", label: "危险", title: "危险" },
  { value: "note", label: "备注", title: "备注" },
] as const;
const sourceTypes: readonly string[] = ["paragraph", "blockquote", "detail", "highlight-block"];
export const conversionCommands: EditorCommand[] = [
  {
    id: "tau.transform.to.callout",
    run: (editor, ctx) => {
      if (!ctx.element || !sourceTypes.includes(ctx.element.type)) return;
      const path = getCommandElementPath(editor, ctx);
      if (!path) return;
      const options =
        (ctx.payload as { options?: Record<string, unknown> } | undefined)?.options ?? {};
      if (typeof options !== "object" || Array.isArray(options)) return;
      const calloutType = options.calloutType ?? "info";
      const title = options.title ?? "提示";
      if (!CALLOUT_TYPES.some(item => item.value === calloutType) || typeof title !== "string")
        return;
      Transforms.setNodes(
        editor,
        {
          type: "callout",
          calloutType: calloutType as "info" | "tip" | "warning" | "danger" | "note",
          title,
        },
        { at: path }
      );
    },
  },
  {
    id: "tau.transform.callout.to-paragraph",
    run: (editor, ctx) => {
      if (ctx.element?.type !== "callout") return;
      const path = getCommandElementPath(editor, ctx);
      if (path) Transforms.unwrapNodes(editor, { at: path });
    },
  },
];
export const conversionMenuFor = {
  ...createBlockConversionMenu(sourceTypes, [
    {
      order: 70,
      id: "tau.transform.callout",
      title: "Callout 块",
      icon: <MessageSquare size={16} />,
      children: CALLOUT_TYPES.map(type => ({
        id: `tau.transform.callout-${type.value}`,
        title: type.label,
        icon:
          type.value === "info" ? (
            <Info size={16} />
          ) : type.value === "tip" ? (
            <Lightbulb size={16} />
          ) : type.value === "warning" ? (
            <AlertTriangle size={16} />
          ) : type.value === "danger" ? (
            <AlertCircle size={16} />
          ) : (
            <FileText size={16} />
          ),
        command: "tau.transform.to.callout",
        payload: {
          target: "callout",
          options: { calloutType: type.value, title: type.title },
        },
      })),
      when: ctx => !isType(ctx, "callout"),
    },
  ]),
  ...createBlockConversionMenu(
    ["callout"],
    [
      {
        order: 10,
        id: "tau.transform.paragraph",
        title: "段落",
        icon: <FileText size={16} />,
        command: "tau.transform.callout.to-paragraph",
        payload: { target: "paragraph" },
      },
    ]
  ),
};
