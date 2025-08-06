import { useRef, useState } from "react";
import { Descendant } from "slate";
import { Button, App } from "antd";

import ErrorBoundary from "@/components/ErrorBoundary";
import Editor, { EditorRef } from "@/components/Editor";
import AddTag from "@/components/AddTag";
import useUploadResource from "@/hooks/useUploadResource.ts";
import { createCard, closeWindow } from "@/commands";
import { ECardCategory } from "@/types";
import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
} from "@/editor-extensions";

import styles from "./index.module.less";
import { getContentLength } from "@/utils";
import useInitDatabase from "@/hooks/useInitDatabase";
import { LoadingOutlined } from "@ant-design/icons";

const customExtensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
];

const initValue: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

const QuickCard = () => {
  const { databaseStatus, active } = useInitDatabase();

  const isConnected = databaseStatus[active];

  const uploadResource = useUploadResource();
  const editorRef = useRef<EditorRef>(null);
  const { message } = App.useApp();

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

  const onEditTag = (oldTag: string, newTag: string) => {
    if (!newTag || newTag === oldTag) return;
    if (tags.includes(newTag)) {
      message.warning("标签已存在");
      return;
    }
    setTags(tags.map((tag) => (tag === oldTag ? newTag : tag)));
  };

  const onSave = async () => {
    setSaveLoading(true);
    await createCard({
      content,
      tags,
      links: [] as number[],
      category: ECardCategory.Temporary,
      count: getContentLength(content),
      isTop: false,
    });
    setSaveLoading(false);
    closeWindow();
  };

  if (!isConnected) {
    return (
      <div className={styles.loading}>
        <LoadingOutlined />
      </div>
    );
  }

  return (
    <div className={styles.quickCardContainer}>
      <div className={styles.editorContainer}>
        <ErrorBoundary>
          <Editor
            className={styles.editor}
            ref={editorRef}
            initValue={initValue}
            onChange={setContent}
            extensions={customExtensions}
            readonly={false}
            uploadResource={uploadResource}
          />
        </ErrorBoundary>
      </div>
      <div className={styles.tags}>
        <AddTag
          tags={tags}
          addTag={onAddTag}
          removeTag={onDeleteTag}
          editTag={onEditTag}
          readonly={false}
        />
      </div>
      <div className={styles.buttons}>
        <Button onClick={onSave} loading={saveLoading}>
          保存并关闭
        </Button>
      </div>
    </div>
  );
};

export default QuickCard;
