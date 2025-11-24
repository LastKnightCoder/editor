import { memo, useCallback, useMemo, useState, useEffect } from "react";
import { createEditor, Descendant } from "slate";
import {
  Slate,
  Editable,
  withReact,
  RenderLeafProps,
  RenderElementProps,
} from "slate-react";
import { useDebounceFn } from "ahooks";
import useTheme from "@/hooks/useTheme";

interface ReviewEditorProps {
  content: Descendant[];
  onSave: (content: Descendant[]) => void;
  readOnly?: boolean;
}

// 简单的叶子节点渲染器（支持基本格式）
const Leaf = ({ attributes, children, leaf }: RenderLeafProps) => {
  let el = children;

  if (leaf.bold) {
    el = <strong>{el}</strong>;
  }
  if (leaf.italic) {
    el = <em>{el}</em>;
  }
  if (leaf.code) {
    el = (
      <code
        style={{
          backgroundColor: "rgba(0,0,0,0.05)",
          padding: "2px 4px",
          borderRadius: "3px",
        }}
      >
        {el}
      </code>
    );
  }
  if (leaf.underline) {
    el = <u>{el}</u>;
  }
  if (leaf.strikethrough) {
    el = <s>{el}</s>;
  }

  return <span {...attributes}>{el}</span>;
};

// 简单的元素渲染器
const Element = ({ attributes, children, element }: RenderElementProps) => {
  const el = element as any;
  const type = el.type;

  if (type === "header") {
    const level = el.level || 1;
    const props = { ...attributes };
    if (level === 1) return <h1 {...props}>{children}</h1>;
    if (level === 2) return <h2 {...props}>{children}</h2>;
    if (level === 3) return <h3 {...props}>{children}</h3>;
    if (level === 4) return <h4 {...props}>{children}</h4>;
    if (level === 5) return <h5 {...props}>{children}</h5>;
    return <h6 {...props}>{children}</h6>;
  }

  if (type === "blockquote") {
    return (
      <blockquote
        {...attributes}
        style={{
          borderLeft: "3px solid #ccc",
          paddingLeft: "10px",
          margin: "10px 0",
        }}
      >
        {children}
      </blockquote>
    );
  }

  if (type === "bulleted-list") {
    return <ul {...attributes}>{children}</ul>;
  }

  if (type === "numbered-list") {
    return <ol {...attributes}>{children}</ol>;
  }

  if (type === "list-item") {
    return <li {...attributes}>{children}</li>;
  }

  if (type === "code-block") {
    return (
      <pre {...attributes}>
        <code>{children}</code>
      </pre>
    );
  }

  return <p {...attributes}>{children}</p>;
};

export const ReviewEditor: React.FC<ReviewEditorProps> = memo((props) => {
  const { content: initialContent, onSave, readOnly = false } = props;
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [value, setValue] = useState<Descendant[]>(initialContent);
  const editor = useMemo(() => withReact(createEditor()), []);

  // 当外部内容变化时更新
  useEffect(() => {
    setValue(initialContent);
  }, [initialContent]);

  // 防抖保存
  const { run: debouncedSave } = useDebounceFn(
    (newValue: Descendant[]) => {
      onSave(newValue);
    },
    { wait: 1000 },
  );

  const handleChange = useCallback(
    (newValue: Descendant[]) => {
      setValue(newValue);
      if (!readOnly) {
        debouncedSave(newValue);
      }
    },
    [readOnly, debouncedSave],
  );

  const handleBlur = useCallback(() => {
    if (!readOnly) {
      onSave(value);
    }
  }, [readOnly, onSave, value]);

  const bgColor = isDark ? "#1a1a1a" : "#f5f5f5";
  const textColor = isDark ? "#e0e0e0" : "#333333";

  return (
    <div
      style={{
        backgroundColor: bgColor,
        color: textColor,
        padding: readOnly ? "8px 12px" : "12px",
        borderRadius: "4px",
        fontSize: "14px",
        lineHeight: "1.6",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <Slate editor={editor} initialValue={value} onValueChange={handleChange}>
        <Editable
          readOnly={readOnly}
          renderLeaf={Leaf}
          renderElement={Element}
          onBlur={handleBlur}
          placeholder={readOnly ? "" : "输入你的想法..."}
          style={{ outline: "none" }}
        />
      </Slate>
    </div>
  );
});

ReviewEditor.displayName = "ReviewEditor";
