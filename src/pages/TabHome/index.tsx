import { memo, useRef, useState } from "react";
import { Button, App } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import { Descendant } from "slate";
import { useMemoizedFn } from "ahooks";

import Editor, { EditorRef } from "@/components/Editor";
import useSettingStore from "@/stores/useSettingStore";
import useTabStore from "@/stores/useTabStore";
import { createCard } from "@/commands";
import { ECardCategory } from "@/types";
import { DEFAULT_CARD_CONTENT } from "@/constants/card";
import { TabType } from "@/types/tab";

import styles from "./index.module.less";

// 快捷方式配置
const SHORTCUTS = [
  { key: "card", type: TabType.CardList, icon: "📝", label: "卡片" },
  { key: "article", type: TabType.ArticleList, icon: "📄", label: "文章" },
  { key: "project", type: TabType.ProjectList, icon: "📁", label: "项目" },
  { key: "document", type: TabType.DocumentList, icon: "📚", label: "知识库" },
  {
    key: "whiteBoard",
    type: TabType.WhiteBoardList,
    icon: "🎨",
    label: "白板",
  },
  { key: "pdf", type: TabType.PdfList, icon: "📕", label: "PDF" },
  { key: "dailyNote", type: TabType.DailyNote, icon: "📖", label: "日记" },
  {
    key: "vecDocuments",
    type: TabType.VecDocument,
    icon: "🔍",
    label: "索引数据库",
  },
  { key: "goal", type: TabType.Goals, icon: "🎯", label: "进度管理" },
  {
    key: "resourceManagement",
    type: TabType.ResourceManagement,
    icon: "🗂️",
    label: "资源管理",
  },
  { key: "todo", type: TabType.Todo, icon: "✅", label: "任务列表" },
  { key: "question", type: TabType.Questions, icon: "❓", label: "问题管理" },
  { key: "pomodoro", type: TabType.Pomodoro, icon: "🍅", label: "番茄专注" },
  { key: "calendar", type: TabType.Calendar, icon: "📅", label: "日历" },
];

const TabHome = memo(() => {
  const { message } = App.useApp();
  const editorRef = useRef<EditorRef>(null);
  const [content, setContent] = useState<Descendant[]>(DEFAULT_CARD_CONTENT);
  const [saving, setSaving] = useState(false);

  const moduleSetting = useSettingStore((state) => state.setting.module);
  const navigateTo = useTabStore((state) => state.navigateTo);

  const handleShortcutClick = useMemoizedFn((type: TabType) => {
    navigateTo(type);
  });

  const handleSave = useMemoizedFn(async () => {
    // 检查内容是否为空
    const isEmptyContent = content.every((node: any) => {
      if (node.type === "paragraph" && node.children) {
        return node.children.every((child: any) => {
          return !child.text || child.text.trim() === "";
        });
      }
      return false;
    });

    if (isEmptyContent) {
      message.warning("请输入内容");
      return;
    }

    try {
      setSaving(true);
      const card = await createCard({
        content,
        tags: [],
        links: [],
        category: ECardCategory.Temporary,
        count: 0,
        isTop: false,
      });

      message.success("保存成功");

      // 清空编辑器
      editorRef.current?.setEditorValue(DEFAULT_CARD_CONTENT);
      setContent(DEFAULT_CARD_CONTENT);

      // 跳转到卡片详情
      navigateTo(TabType.CardDetail, { id: card.id });
    } catch (error) {
      console.error("保存失败", error);
      message.error("保存失败");
    } finally {
      setSaving(false);
    }
  });

  const handleContentChange = useMemoizedFn((value: Descendant[]) => {
    setContent(value);
  });

  // 过滤启用的快捷方式
  const enabledShortcuts = SHORTCUTS.filter((shortcut) => {
    const moduleKey = shortcut.key as keyof typeof moduleSetting;
    return moduleSetting[moduleKey]?.enable !== false;
  });

  return (
    <div className={styles.tabHome}>
      <div className={styles.shortcuts}>
        {enabledShortcuts.map((shortcut) => (
          <div
            key={shortcut.key}
            className={styles.shortcutItem}
            onClick={() => handleShortcutClick(shortcut.type)}
          >
            <div className={styles.shortcutIcon}>{shortcut.icon}</div>
            <div className={styles.shortcutLabel}>{shortcut.label}</div>
          </div>
        ))}
      </div>

      <div className={styles.editorContainer}>
        <div className={styles.editorWrapper}>
          <Editor
            ref={editorRef}
            initValue={DEFAULT_CARD_CONTENT}
            readonly={false}
            onChange={handleContentChange}
            placeHolder="输入内容快速创建卡片..."
          />
        </div>
      </div>

      <Button
        type="primary"
        size="large"
        icon={<SaveOutlined />}
        loading={saving}
        className={styles.saveBtn}
        onClick={handleSave}
      >
        保存
      </Button>
    </div>
  );
});

export default TabHome;
