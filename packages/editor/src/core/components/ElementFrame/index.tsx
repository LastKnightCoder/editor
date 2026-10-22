import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Transforms, type Element } from "slate";
import { useReadOnly, useSlateStatic, type RenderElementProps } from "slate-react";
import { cn } from "@tau/ui";

import AddParagraph from "../AddParagraph";
import ElementMenu from "../ElementMenu";
import useIsLastElement from "../../hooks/useIsLastElement";
import { getCommandElementPath } from "../../utils/commandTarget";
import { shouldIgnoreBlockKey } from "../../utils/blockKeyTarget";
import type { ElementFrame as ElementFrameOptions } from "../../api/extension";

/** 选中描边：外扩 3px，随内容圆角 */
export const ELEMENT_SELECTED_OUTLINE_CLASS =
  "outline-solid outline-2 outline-offset-[3px] outline-[var(--ed-accent)]";

export interface ElementFrameState {
  selected: boolean;
  select(): void;
  deselect(): void;
  /** 在指定位置打开块菜单（与右键、块手柄同一份条目） */
  openMenu(position: { x: number; y: number }): void;
}

const FrameContext = createContext<ElementFrameState | null>(null);

/** 外框里的块读取选中与菜单状态；不在外框里时为 null */
export const useElementFrame = () => useContext(FrameContext);

/** 选中后删除块并在原位留一个空段落，光标落在那里 */
function removeWithParagraph(editor: ReturnType<typeof useSlateStatic>, element: Element) {
  const path = getCommandElementPath(editor, { element });
  if (!path) return;
  Transforms.removeNodes(editor, { at: path });
  Transforms.insertNodes(
    editor,
    { type: "paragraph", children: [{ type: "formatted", text: "" }] } as Element,
    { at: path, select: true }
  );
}

/**
 * void 块的公共外框：点选与选中描边、右键菜单、选中时的删除与声明的按键、末尾「添加段落」。
 * 块的 render 只渲染内容，attributes 与 children 由外框处理。
 */
export function ElementFrame({
  attributes,
  element,
  children,
  options,
  content,
}: RenderElementProps & { options: ElementFrameOptions; content: ReactNode }) {
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const isLast = useIsLastElement(element);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const elementRef = useRef(element);
  elementRef.current = element;
  const menuOpen = !!menu;

  useEffect(() => {
    if (readOnly) {
      setSelected(false);
      setMenu(null);
    }
  }, [readOnly]);

  useEffect(() => {
    if (!selected) return;
    const onMouseDown = (event: MouseEvent) => {
      if (menuOpen) return;
      if (bodyRef.current && !bodyRef.current.contains(event.target as Node)) setSelected(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [selected, menuOpen]);

  // 选中时的键盘在捕获阶段抢在编辑器之前处理；浮层与文本输入里的按键不拦
  useEffect(() => {
    if (!selected || readOnly || menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (shouldIgnoreBlockKey(event, bodyRef.current)) return;
      const command = options.keys?.[event.key];
      if (command) {
        const path = getCommandElementPath(editor, { element: elementRef.current });
        if (path) editor.commands?.execute(command, undefined, elementRef.current, path);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        setSelected(false);
        removeWithParagraph(editor, elementRef.current);
      } else if (event.key === "Escape") setSelected(false);
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [selected, readOnly, menuOpen, editor, options.keys]);

  const state = useMemo<ElementFrameState>(
    () => ({
      selected: selected && !readOnly,
      select: () => {
        if (!readOnly) setSelected(true);
      },
      deselect: () => setSelected(false),
      openMenu: position => {
        if (!readOnly) setMenu(position);
      },
    }),
    [selected, readOnly]
  );

  return (
    <div {...attributes} data-element-frame="">
      <FrameContext.Provider value={state}>
        <div
          ref={bodyRef}
          contentEditable={false}
          className={cn(
            "relative rounded-[var(--tau-radius-sm)]",
            state.selected && ELEMENT_SELECTED_OUTLINE_CLASS
          )}
          onMouseDown={() => state.select()}
          onContextMenu={event => {
            if (readOnly) return;
            event.preventDefault();
            setSelected(true);
            setMenu({ x: event.clientX, y: event.clientY });
          }}
        >
          {content}
        </div>
      </FrameContext.Provider>
      {options.appendParagraph !== false && !(readOnly && isLast) && (
        <AddParagraph element={element} />
      )}
      {menu && <ElementMenu element={element} position={menu} onClose={() => setMenu(null)} />}
      {children}
    </div>
  );
}
