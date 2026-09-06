import { ReactEditor, RenderElementProps, useSlate, useReadOnly } from "slate-react";
import { Editor, Transforms } from "slate";
import { v4 as getUUid } from "uuid";

import { ITabItem, TabPaneElement, TabsElement } from "../../../types";
import AddParagraph from "../../../../components/AddParagraph";
import TabsHeader from "../TabsHeader";
import useIsLastElement from "../../../../hooks/useIsLastElement";

import styles from "./index.module.less";
import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import classnames from "classnames";
import { GripVertical } from "lucide-react";
import { TabsActiveContext } from "../../context";

interface ITabsProps {
  element: TabsElement;
  attributes: RenderElementProps["attributes"];
  children: React.ReactNode;
}

const createEmptyPane = (title: string): TabPaneElement => ({
  type: "tab-pane",
  tabKey: getUUid(),
  title,
  children: [
    {
      type: "paragraph",
      children: [
        {
          type: "formatted",
          text: "",
        },
      ],
    },
  ],
});

const Tabs = (props: ITabsProps) => {
  const { attributes, element, children } = props;
  const panes = (Array.isArray(element.children) ? element.children : []).filter(
    child => child.type === "tab-pane"
  ) as TabPaneElement[];
  const activeKey = panes.some(pane => pane.tabKey === element.activeKey)
    ? element.activeKey
    : panes[0]?.tabKey || "";
  const isLast = useIsLastElement(element);
  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } = useDragAndDrop({
    element,
  });

  const editor = useSlate();
  const readOnly = useReadOnly();

  const getPanes = (): TabPaneElement[] => {
    // element 是渲染快照，连续操作前需从编辑器读最新节点
    const path = ReactEditor.findPath(editor, element);
    const [node] = Editor.node(editor, path);
    return ((node as TabsElement).children || []).filter(
      child => child.type === "tab-pane"
    ) as TabPaneElement[];
  };

  const handleClickTab = (key: string) => {
    if (key === activeKey) return;
    const path = ReactEditor.findPath(editor, element);
    Editor.withoutNormalizing(editor, () => {
      Transforms.setNodes(editor, { activeKey: key }, { at: path });
      // 选区不能留在被隐藏的旧 pane 里，否则后续输入会打到看不见的 Tab
      if (!readOnly && editor.selection) {
        const index = getPanes().findIndex(pane => pane.tabKey === key);
        if (index >= 0) {
          Transforms.select(editor, Editor.start(editor, [...path, index]));
        }
      }
    });
  };

  const onAddTab = () => {
    if (readOnly) return;
    const path = ReactEditor.findPath(editor, element);
    const currentPanes = getPanes();
    const pane = createEmptyPane("Tab" + (currentPanes.length + 1));
    Editor.withoutNormalizing(editor, () => {
      Transforms.insertNodes(editor, pane, { at: [...path, currentPanes.length] });
      Transforms.setNodes(editor, { activeKey: pane.tabKey }, { at: path });
      Transforms.select(editor, Editor.start(editor, [...path, currentPanes.length]));
    });
  };

  const onDeleteTab = (key: string) => {
    if (readOnly) return;
    const path = ReactEditor.findPath(editor, element);
    const currentPanes = getPanes();
    const index = currentPanes.findIndex(pane => pane.tabKey === key);
    if (index < 0) return;
    const remaining = currentPanes.filter(pane => pane.tabKey !== key);
    Editor.withoutNormalizing(editor, () => {
      Transforms.removeNodes(editor, { at: [...path, index] });
      if (remaining.length === 0) {
        Transforms.removeNodes(editor, { at: path });
        Transforms.insertNodes(
          editor,
          {
            type: "paragraph",
            children: [
              {
                type: "formatted",
                text: "",
              },
            ],
          },
          {
            at: path,
            select: true,
          }
        );
      } else if (key === activeKey) {
        const next = remaining[Math.min(index, remaining.length - 1)];
        Transforms.setNodes(editor, { activeKey: next.tabKey }, { at: path });
        const nextIndex = remaining.findIndex(pane => pane.tabKey === next.tabKey);
        if (nextIndex >= 0 && editor.selection) {
          Transforms.select(editor, Editor.start(editor, [...path, nextIndex]));
        }
      }
    });
  };

  const onTitleChange = (key: string, title: string) => {
    if (readOnly) return;
    const path = ReactEditor.findPath(editor, element);
    const currentPanes = getPanes();
    const index = currentPanes.findIndex(pane => pane.tabKey === key);
    if (index < 0) return;
    Transforms.setNodes(editor, { title }, { at: [...path, index] });
  };

  const onMoveTab = (fromKey: string, insertAt: number) => {
    if (readOnly) return;
    const path = ReactEditor.findPath(editor, element);
    const currentPanes = getPanes();
    const fromIndex = currentPanes.findIndex(pane => pane.tabKey === fromKey);
    if (fromIndex < 0) return;
    // moveNodes 的目标是移除自身后的插入位置
    let to = fromIndex < insertAt ? insertAt - 1 : insertAt;
    to = Math.max(0, Math.min(to, currentPanes.length - 1));
    if (to === fromIndex) return;
    Transforms.moveNodes(editor, { at: [...path, fromIndex], to: [...path, to] });
  };

  const tabs: ITabItem[] = panes.map(pane => ({ key: pane.tabKey, title: pane.title }));

  return (
    <div
      ref={node => {
        drop(node);
      }}
      className={classnames(styles.dropContainer, {
        [styles.dragging]: isDragging,
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
      })}
    >
      <div className="overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_3px_10px_rgba(15,23,42,0.03)] dark:border-zinc-700/50 dark:bg-zinc-900/40 dark:shadow-none">
        <TabsHeader
          tabs={tabs}
          activeKey={activeKey}
          onClickTab={handleClickTab}
          onDeleteTab={onDeleteTab}
          onAddTab={onAddTab}
          onTitleChange={onTitleChange}
          onMoveTab={onMoveTab}
        />
        <TabsActiveContext.Provider value={activeKey}>
          <div
            className="relative border-t border-zinc-950/[0.055] px-5 py-4 dark:border-white/[0.07]"
            {...attributes}
          >
            {children}
          </div>
        </TabsActiveContext.Provider>
      </div>
      {!(readOnly && isLast) && <AddParagraph element={element} />}
      <div
        contentEditable={false}
        ref={node => {
          drag(node);
        }}
        className={classnames(styles.dragHandler, {
          [styles.canDrag]: canDrag,
        })}
      >
        <GripVertical className={styles.icon} />
      </div>
    </div>
  );
};

export default Tabs;
