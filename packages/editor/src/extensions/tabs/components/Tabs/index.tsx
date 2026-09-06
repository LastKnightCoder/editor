import { ReactEditor, RenderElementProps, useSlate, useReadOnly } from "slate-react";
import { Editor, Transforms, Element } from "slate";
import { produce } from "immer";
import { v4 as getUUid } from "uuid";

import { ITabsContent, TabsElement } from "../../../types";
import AddParagraph from "../../../../components/AddParagraph";
import TabsHeader from "../TabsHeader";
import useIsLastElement from "../../../../hooks/useIsLastElement";

import styles from "./index.module.less";
import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import classnames from "classnames";
import { MdDragIndicator } from "react-icons/md";
import { BlockElement } from "../../../../types/custom-element";

interface ITabsProps {
  element: TabsElement;
  attributes: RenderElementProps["attributes"];
  children: RenderElementProps["children"];
}

const Tabs = (props: ITabsProps) => {
  const { attributes, element, children } = props;
  const { activeKey } = element;
  const tabsContent = Array.isArray(element.tabsContent) ? element.tabsContent : [];
  const isLast = useIsLastElement(element);
  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } = useDragAndDrop({
    element,
  });

  const editor = useSlate();
  const readOnly = useReadOnly();

  const setTabsData = (
    newActiveKey: string,
    newTabsContent: ITabsContent[],
    newChildren: BlockElement[]
  ) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.delete(editor, {
      at: path,
    });

    Transforms.insertNodes(
      editor,
      {
        type: "tabs",
        activeKey: newActiveKey,
        tabsContent: newTabsContent,
        children: newChildren,
      },
      {
        at: path,
      }
    );
  };

  const syncCurrentTabContent = () => {
    const newTabsContent = produce(tabsContent, draft => {
      const currentTab = draft.find(tab => tab.key === activeKey);
      if (currentTab) {
        currentTab.content = element.children;
      } else {
        draft.push({
          key: activeKey,
          content: element.children,
          title: "New Tab",
        });
      }
    });
    setTabsData(activeKey, newTabsContent, element.children);
  };

  const handleClickTab = (key: string) => {
    if (key === activeKey) return;

    const newActiveKey = key;
    const newTabsContent = produce(tabsContent, draft => {
      const currentTab = draft.find(tab => tab.key === activeKey);
      if (currentTab) {
        currentTab.content = element.children;
      } else {
        draft.push({
          key: activeKey,
          content: element.children,
          title: "New Tab",
        });
      }
    });
    const newChildren = newTabsContent.find(tab => tab.key === newActiveKey)!.content;

    setTabsData(newActiveKey, newTabsContent, newChildren);
  };

  // 直接设置 children 没有用，需要先删除再插入
  const onAddTab = () => {
    if (readOnly) return;
    const newAddKey = getUUid();
    const tab: ITabsContent = {
      key: newAddKey,
      content: [
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
      title: "Tab" + (tabsContent.length + 1),
    };
    const newTabsContent = produce(tabsContent, draft => {
      const currentTab = draft.find(tab => tab.key === activeKey);
      if (currentTab) {
        currentTab.content = element.children;
      }
      draft.push(tab);
    });

    setTabsData(newAddKey, newTabsContent, tab.content);
  };

  const onDeleteTab = (key: string) => {
    if (readOnly) return;
    const path = ReactEditor.findPath(editor, element);
    const nextKey = tabsContent.find(tab => tab.key !== key)?.key;
    const nextTab = tabsContent.find(tab => tab.key === nextKey);
    const newTabsContent = tabsContent.filter(tab => tab.key !== key);
    if (key === activeKey) {
      if (!nextTab) {
        Transforms.delete(editor, {
          at: path,
        });
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
      } else {
        const { key, content } = nextTab;
        setTabsData(key, newTabsContent, content);
      }
    } else {
      const selection = editor.selection;
      setTabsData(activeKey, newTabsContent, element.children);
      ReactEditor.focus(editor);
      if (selection) {
        const focus = selection.focus;
        const focusPath = focus.path;
        focusPath.pop();
        const [element] = Editor.node(editor, focusPath);
        if (!Editor.isVoid(editor, element as Element)) {
          Transforms.select(editor, selection);
        }
      }
    }
  };

  const onTitleChange = (key: string, title: string) => {
    if (readOnly) return;
    const newTabsContent = produce(tabsContent, draft => {
      const tab = draft.find(tab => tab.key === key);
      if (!tab) return;
      tab.title = title;
    });
    setTabsData(activeKey, newTabsContent, element.children);
  };

  return (
    <div
      ref={node => {
        drop(node);
      }}
      onBlur={syncCurrentTabContent}
      className={classnames(styles.dropContainer, {
        [styles.dragging]: isDragging,
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
      })}
    >
      <div className="overflow-hidden rounded-xl border border-zinc-200/70 dark:border-zinc-700/40">
        <TabsHeader
          tabs={tabsContent}
          activeKey={activeKey}
          onClickTab={handleClickTab}
          onDeleteTab={onDeleteTab}
          onAddTab={onAddTab}
          onTitleChange={onTitleChange}
        />
        <div className="p-[1em]" {...attributes}>
          {children}
        </div>
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
        <MdDragIndicator className={styles.icon} />
      </div>
    </div>
  );
};

export default Tabs;
