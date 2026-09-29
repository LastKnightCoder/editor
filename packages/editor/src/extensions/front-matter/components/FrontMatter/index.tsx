import { useMemo, useCallback, useState, useRef } from "react";
import { Transforms } from "slate";
import { RenderElementProps, useSlateStatic, useReadOnly, ReactEditor } from "slate-react";
import { cn } from "@tau/ui";
import YAML from "yaml";
import type { FrontMatterElement } from "../../../types";
import { FiTag, FiAlignLeft, FiClock, FiList } from "react-icons/fi";

interface FrontMatterProps {
  element: FrontMatterElement;
  attributes: RenderElementProps["attributes"];
  children: RenderElementProps["children"];
}

// 只有 description 可编辑，name 等字段只读
const EDITABLE_KEYS = new Set(["description"]);

const VALUE_CLASS = "flex-1 text-[var(--ed-text)] [word-break:break-word]";
// 输入框与文本框共用的外观
const FIELD_CLASS =
  "w-full rounded-[0.375em] border border-solid border-[var(--ed-border)] bg-transparent px-[0.75em] py-[0.5em] font-[inherit] text-[length:inherit] text-[var(--ed-text)] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[var(--ed-text-tertiary)] placeholder:opacity-60 focus:border-[var(--ed-accent)] focus:shadow-[0_0_0_2px_var(--ed-accent-soft)]";

const FrontMatter = (props: FrontMatterProps) => {
  const { attributes, children, element } = props;
  const editor = useSlateStatic();
  const readOnly = useReadOnly();

  const { value } = element;

  // 用于跟踪是否正在输入中文
  const isComposingRef = useRef(false);
  // 本地编辑状态，用于处理中文输入
  const [localValues, setLocalValues] = useState<Record<string, string>>({});

  const parsedValue: Record<string, any> = useMemo(() => {
    try {
      const parsed = YAML.parse(value);
      return parsed || {};
    } catch (e) {
      console.error("Error parsing front matter:", e);
    }
    return {};
  }, [value]);

  // 更新 front-matter 值到 Slate
  const commitValue = useCallback(
    (key: string, newValue: string) => {
      const newParsed = { ...parsedValue, [key]: newValue };
      const newYaml = YAML.stringify(newParsed, {
        lineWidth: 0,
        defaultKeyType: "PLAIN",
      }).trim();
      try {
        const path = ReactEditor.findPath(editor, element);
        Transforms.setNodes(editor, { value: newYaml }, { at: path });
      } catch (e) {
        console.error("Error updating front matter:", e);
      }
    },
    [editor, element, parsedValue]
  );

  // 处理本地输入变化
  const handleLocalChange = useCallback((key: string, newValue: string) => {
    setLocalValues(prev => ({ ...prev, [key]: newValue }));
  }, []);

  // 获取显示值（优先使用本地编辑值）
  const getDisplayValue = useCallback(
    (key: string) => {
      if (key in localValues) {
        return localValues[key];
      }
      return String(parsedValue[key] ?? "");
    },
    [localValues, parsedValue]
  );

  // 处理失焦时提交
  const handleBlur = useCallback(
    (key: string) => {
      if (key in localValues) {
        commitValue(key, localValues[key]);
        // 清除本地状态
        setLocalValues(prev => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    },
    [localValues, commitValue]
  );

  const getIconForKey = (key: string) => {
    switch (key) {
      case "title":
      case "name":
        return <FiAlignLeft />;
      case "created":
      case "updated":
        return <FiClock />;
      case "tags":
        return <FiTag />;
      default:
        return <FiList />;
    }
  };

  const renderTagsValue = (value: string | string[]) => {
    if (Array.isArray(value)) {
      return (
        <div className="flex flex-wrap gap-[0.375em]">
          {value.map((tag, index) => (
            <span
              key={index}
              className="inline-block rounded-[0.25em] bg-[var(--ed-accent-soft)] px-[0.6em] py-[0.2em] text-[0.85em] text-[var(--ed-accent)]"
            >
              {tag}
            </span>
          ))}
        </div>
      );
    }
    return String(value);
  };

  // 渲染可编辑或只读的值
  const renderValue = (key: string, value: any) => {
    // 特殊处理 tags（数组类型）
    if (key === "tags") {
      return renderTagsValue(value);
    }

    // 对象类型只读显示
    if (typeof value === "object" && value !== null) {
      return <span className={VALUE_CLASS}>{JSON.stringify(value)}</span>;
    }

    const stringValue = String(value ?? "");

    // 只读模式或非可编辑字段：显示纯文本
    if (readOnly || !EDITABLE_KEYS.has(key)) {
      return <span className={VALUE_CLASS}>{stringValue}</span>;
    }

    // 编辑模式：description 使用多行文本框
    if (key === "description") {
      return (
        <textarea
          className={cn(
            VALUE_CLASS,
            FIELD_CLASS,
            "max-h-[4lh] min-h-[1lh] resize-none overflow-y-auto leading-[1.5] [field-sizing:content]"
          )}
          value={getDisplayValue(key)}
          onChange={e => handleLocalChange(key, e.target.value)}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={e => {
            isComposingRef.current = false;
            // 中文输入结束时，更新本地状态
            handleLocalChange(key, e.currentTarget.value);
          }}
          onBlur={() => handleBlur(key)}
          placeholder="请输入描述（简短描述 Skill 的用途）"
          rows={2}
        />
      );
    }

    // 其他可编辑字段使用单行输入框
    return (
      <input
        type="text"
        className={cn(VALUE_CLASS, FIELD_CLASS)}
        value={getDisplayValue(key)}
        onChange={e => handleLocalChange(key, e.target.value)}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={e => {
          isComposingRef.current = false;
          handleLocalChange(key, e.currentTarget.value);
        }}
        onBlur={() => handleBlur(key)}
        placeholder={`请输入 ${key}`}
      />
    );
  };

  return (
    <div
      {...attributes}
      className="my-[1em] select-none rounded-[0.5em] bg-[var(--ed-bg-page)] p-[1em]"
      contentEditable={false}
    >
      <div className="p-0">
        <div className="flex flex-col gap-[0.75em]">
          {Object.entries(parsedValue).map(([key, value]) => (
            <div
              key={key}
              className={cn("flex items-center text-[0.85em]", !readOnly && "items-start")}
            >
              <span
                className={cn(
                  "flex min-w-[7.5em] items-center gap-[0.75em] font-medium text-[var(--ed-text-secondary)] [&_svg]:h-[1em] [&_svg]:w-[1em] [&_svg]:opacity-70",
                  !readOnly && "pt-[0.5em]"
                )}
              >
                {getIconForKey(key)} {key}
              </span>
              {renderValue(key, value)}
            </div>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
};

export default FrontMatter;
