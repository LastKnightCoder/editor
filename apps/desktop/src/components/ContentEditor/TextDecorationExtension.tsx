import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { Element } from "slate";
import { ReactEditor, useSlateStatic } from "slate-react";
import { defineExtension, type EditorProps } from "@tau/editor";
import type { MarkRenderProps } from "@tau/editor/api";
import type { PluginDecorationSource } from "@tau/plugins";
import { DecorationHit, type DesktopTextDecorations } from "@/app/plugins/text-decorations";
import { TextDecorationView } from "./text-decoration-view";

const clickable = new Set(["reference", "ghost", "dot"]);

function DecorationMark({ leaf, children }: MarkRenderProps) {
  const editor = useSlateStatic();
  const view = useContext(DecorationViewContext);
  const ref = useRef<HTMLSpanElement>(null);
  const hit = "tauPluginDecoration" in leaf ? leaf.tauPluginDecoration : undefined;
  const valid = hit instanceof DecorationHit;
  useLayoutEffect(() => {
    if (valid && view && ref.current) return view.bind(ref.current, hit);
  }, [valid, view, hit]);
  if (!valid) return <>{children}</>;
  const shared = {
    ref,
    "data-tau-decoration": hit.appearance,
    "data-tone": hit.tone === "accent" ? undefined : hit.tone,
    "data-tail": "tauPluginDecorationTail" in leaf && leaf.tauPluginDecorationTail ? "" : undefined,
    onPointerEnter: () => view?.layer?.hover(hit, ref.current),
    onPointerLeave: () => view?.layer?.hover(hit, null),
  };
  if (!hit.activate) return <span {...shared}>{children}</span>;
  const activate = () => {
    if (!ReactEditor.isComposing(editor) && ref.current) view?.layer?.activate(hit, ref.current);
  };
  const link = clickable.has(hit.appearance);
  return (
    <span
      {...shared}
      role={link ? "link" : "button"}
      tabIndex={0}
      onClick={event => {
        if (event.currentTarget.ownerDocument.getSelection()?.isCollapsed) activate();
      }}
      onKeyDown={event => {
        if (
          event.nativeEvent.isComposing ||
          (event.key !== "Enter" && !(!link && event.key === " "))
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        activate();
      }}
    >
      {children}
    </span>
  );
}

export const textDecorationExtension = defineExtension({
  id: "host.text-decorations",
  marks: [{ id: "host.text-decoration", keys: ["tauPluginDecoration", "tauPluginDecorationTail"], render: DecorationMark }],
});

export const DecorationViewContext = createContext<TextDecorationView | null>(null);
type RenderBlock = NonNullable<EditorProps["renderTopLevelBlock"]>;
function ObservedBlock({ editor, element, children }: Parameters<RenderBlock>[0]) {
  const view = useContext(DecorationViewContext);
  useEffect(() => view?.observe(editor, element), [view, editor, element]);
  return <>{children}</>;
}

const emptySubscribe = () => () => {};
const zero = () => 0;

export function useTextDecorations(
  registry: DesktopTextDecorations | undefined,
  source: PluginDecorationSource | undefined,
  base?: EditorProps["decorate"],
  renderBlock?: RenderBlock
) {
  const view = useMemo(
    () => (registry && source ? new TextDecorationView(registry, source) : null),
    [registry, source]
  );
  const revision = useSyncExternalStore(view?.subscribe ?? emptySubscribe, view?.snapshot ?? zero);
  const decorate = useMemo<EditorProps["decorate"]>(() => {
    void revision;
    if (!view?.enabled) return base;
    return entry => {
      const ranges = base?.(entry) ?? [];
      const [element, path] = entry;
      return path.length === 1 && Element.isElement(element)
        ? [...ranges, ...view.ranges(element, path)]
        : ranges;
    };
  }, [view, revision, base]);
  const renderTopLevelBlock = useMemo<RenderBlock | undefined>(
    () =>
      source
        ? args => {
            const children = <ObservedBlock {...args} />;
            return renderBlock ? renderBlock({ ...args, children }) : children;
          }
        : renderBlock,
    [source, renderBlock]
  );
  return { decorate, renderTopLevelBlock, view: view?.enabled ? view : null };
}
