import { useEffect, useRef, useState } from "react";
import { Descendant } from "slate";
import { Button } from "antd";

import ErrorBoundary from "@/components/ErrorBoundary";
import Editor, { EditorRef } from "@/components/Editor";
import WindowControl from "@/components/WindowControl";
import AddTag from "@/components/AddTag";
import AISearch from "@/layouts/ShortSidebarLayout/components/AISearch";

import useCardsManagementStore from "@/stores/useCardsManagementStore";
import useInitDatabase from "@/hooks/useInitDatabase.ts";
import useUploadImage from "@/hooks/useUploadImage.ts";
import { ECardCategory } from "@/types";
import {
  cardLinkExtension,
  fileAttachmentExtension,
} from "@/editor-extensions";

import styles from "./index.module.less";
import { getContentLength } from "@/utils";

const customExtensions = [cardLinkExtension, fileAttachmentExtension];

const initValue: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

const QuickCard = () => {
  const { initDatabase } = useInitDatabase();

  useEffect(() => {
    initDatabase();
  }, [initDatabase]);

  const { createCard } = useCardsManagementStore((state) => ({
    createCard: state.createCard,
  }));

  const uploadImage = useUploadImage();
  const editorRef = useRef<EditorRef>(null);

  const [content, setContent] = useState(initValue);
  const [tags, setTags] = useState<string[]>([]);
  const [saveLoading, setSaveLoading] = useState(false);

  const onAddTag = (tag: string) => {
    // 如果已经存在直接返回
    if (tags.includes(tag)) {
      return;
    }
    setTags([...tags, tag]);
  };

  const onDeleteTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const onSave = async () => {
    setSaveLoading(true);
    await createCard({
      content,
      tags,
      links: [] as number[],
      category: ECardCategory.Temporary,
      count: getContentLength(content),
    });
    setSaveLoading(false);
    editorRef.current?.setEditorValue(initValue);
    setContent(initValue);
  };

  return (
    <div className={styles.quickCardContainer}>
      <div data-tauri-drag-region className={styles.titleBar}>
        <div className={styles.title}>快捷卡片</div>
        <WindowControl
          className={styles.windowControl}
          notShowFullscreen
          initAlwaysOnTop
        />
      </div>
      <div className={styles.editor}>
        <ErrorBoundary>
          <Editor
            ref={editorRef}
            initValue={initValue}
            onChange={setContent}
            extensions={customExtensions}
            readonly={false}
            uploadImage={uploadImage}
          />
        </ErrorBoundary>
      </div>
      <div className={styles.tags}>
        <AddTag
          tags={tags}
          addTag={onAddTag}
          removeTag={onDeleteTag}
          readonly={false}
        />
      </div>
      <div className={styles.buttons}>
        <Button onClick={onSave} loading={saveLoading}>
          保存
        </Button>
      </div>
      <AISearch />
    </div>
  );
};

export default QuickCard;
