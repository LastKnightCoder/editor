import { ReactEditor, RenderElementProps, useSlate, useReadOnly } from "slate-react";
import { useEffect, useMemo } from "react";
import { Transforms } from "slate";
import { produce } from 'immer';
import { v4 as getUUid } from 'uuid';

import { ITabsContent, TabsElement } from "@/components/Editor/types";
import AddParagraph from "@/components/Editor/components/AddParagraph";
import TabsHeader from "../TabsHeader";

import styles from './index.module.less';

interface ITabsProps {
  element: TabsElement;
  attributes: RenderElementProps['attributes'];
  children: RenderElementProps['children'];
}

const Tabs = (props: ITabsProps) => {
  const { attributes, element, children } = props;
  const { activeKey, tabsContent } = element;
  
  const editor = useSlate();
  const readOnly = useReadOnly();
  const bottomLineId = useMemo(() => {
    return ReactEditor.findPath(editor, element).join('-');
  }, [editor, element]);

  useEffect(() => {
    console.log('element', element);
  }, [element]);

  const setTabsData = (newActiveKey: string, newTabsContent: ITabsContent[], newChildren: any) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.delete(editor, {
      at: path,
    });

    Transforms.insertNodes(editor, {
      type: 'tabs',
      activeKey: newActiveKey,
      tabsContent: newTabsContent,
      children: newChildren,
    }, {
      at: path,
      select: true,
    });
  }

  const syncCurrentTabContent = () => {
    const newTabsContent = produce(tabsContent, draft => {
      const currentTab = draft.find(tab => tab.key === activeKey);
      if (currentTab) {
        currentTab.content = element.children;
      } else {
        draft.push({
          key: activeKey,
          content: element.children,
          title: 'New Tab',
        });
      }
    });
    setTabsData(activeKey, newTabsContent, element.children);
  }
  
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
          title: 'New Tab',
        });
      }
    });
    const newChildren = newTabsContent.find(tab => tab.key === newActiveKey)!.content as any;

    setTabsData(newActiveKey, newTabsContent, newChildren);
  }

  // 直接设置 children 没有用，需要先删除再插入
  const onAddTab = () => {
    if (readOnly) return;
    const newAddKey = getUUid();
    const tab: ITabsContent = {
      key: newAddKey,
      content: [{
        type: 'paragraph',
        children: [{
          type: 'formatted',
          text: ''
        }]
      }],
      title: 'Tab' + (tabsContent.length + 1),
    };
    const newTabsContent = produce(tabsContent, draft => {
      const currentTab = draft.find(tab => tab.key === activeKey);
      if (currentTab) {
        currentTab.content = element.children;
      }
      draft.push(tab);
    });

    setTabsData(newAddKey, newTabsContent, tab.content as any);
  }

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
        Transforms.insertNodes(editor, {
          type: 'paragraph',
          children: [{
            type: 'formatted',
            text: ''
          }]
        }, {
          at: path,
          select: true,
        })
      } else {
        const { key, content } = nextTab;
        setTabsData(key, newTabsContent, content);
      }
    } else {
      const selection = editor.selection;
      setTabsData(activeKey, newTabsContent, element.children);
      ReactEditor.focus(editor);
      if (selection) {
        Transforms.select(editor, selection);
      }
    }
  }

  const onTitleChange = (key: string, title: string) => {
    if (readOnly) return;
    const newTabsContent = produce(tabsContent, draft => {
      const tab = draft.find(tab => tab.key === key);
      if (!tab) return;
      tab.title = title;
    });
    setTabsData(activeKey, newTabsContent, element.children);
  }

  return (
    <div
      {...attributes}
      onBlur={syncCurrentTabContent}
    >
      <div className={styles.tabsContainer}>
        <TabsHeader
          tabs={tabsContent}
          activeKey={activeKey}
          bottomLineId={bottomLineId}
          onClickTab={handleClickTab}
          onDeleteTab={onDeleteTab}
          onAddTab={onAddTab}
          onTitleChange={onTitleChange}
        />
        <div className={styles.content}>
          {children}
        </div>
      </div>
      <AddParagraph element={element} />
    </div>
  )
}

 export default Tabs;