import { useState, useRef, useEffect } from "react";
import { message } from "antd";
import { MdArrowBack, MdSave } from "react-icons/md";
import { useMemoizedFn } from "ahooks";
import { updateCustomBlockReadme } from "@/commands/custom-block";
import type { ICustomBlock } from "@/types/custom-block";
import { importFromMarkdown, getMarkdown } from "@/utils/markdown";
import Editor, { EditorRef } from "@/components/Editor";
import type { Descendant } from "slate";
import styles from "./CustomBlockReadmeEditor.module.less";

interface CustomBlockReadmeEditorProps {
  block: ICustomBlock;
  onBack: () => void;
}

const CustomBlockReadmeEditor = ({
  block,
  onBack,
}: CustomBlockReadmeEditorProps) => {
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<EditorRef>(null);
  const [editorValue, setEditorValue] = useState<Descendant[]>(() =>
    importFromMarkdown(block.readme || ""),
  );

  useEffect(() => {
    if (editorRef.current && block.readme) {
      const value = importFromMarkdown(block.readme);
      editorRef.current.setEditorValue(value);
    }
  }, [block.readme]);

  const handleSave = useMemoizedFn(async () => {
    if (!editorRef.current) return;

    setSaving(true);
    try {
      const editor = editorRef.current.getEditor();
      const value = editor.children;
      const markdown = getMarkdown(value as Descendant[]);
      await updateCustomBlockReadme(block.id, markdown);
      message.success("保存成功");
    } catch (error) {
      message.error("保存失败");
    } finally {
      setSaving(false);
    }
  });

  const handleChange = useMemoizedFn((value: Descendant[]) => {
    setEditorValue(value);
  });

  return (
    <div className={styles.ideContainer}>
      {/* 顶部导航栏 */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button onClick={onBack} className={styles.backButton}>
            <MdArrowBack />
          </button>
          <div className={styles.headerTitle}>
            <h1 className={styles.title}>{block.manifest.name}</h1>
            <div className={styles.divider} />
            <span className={styles.subtitle}>编辑使用说明</span>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={styles.saveButton}
        >
          <MdSave />
          <span>{saving ? "保存中..." : "保存"}</span>
        </button>
      </div>

      {/* 主体内容区域 */}
      <div className={styles.mainContent}>
        <div className={styles.editorContainer}>
          <Editor
            ref={editorRef}
            initValue={editorValue}
            onChange={handleChange}
            readonly={false}
          />
        </div>
      </div>
    </div>
  );
};

export default CustomBlockReadmeEditor;
