import { useMemo, useCallback, useState, useRef } from "react";
import { Transforms } from "slate";
import {
  RenderElementProps,
  useSlateStatic,
  useReadOnly,
  ReactEditor,
} from "slate-react";
import classNames from "classnames";
import YAML from "yaml";
import type { FrontMatterElement } from "../../../types";
import styles from "./index.module.less";
import { FiTag, FiAlignLeft, FiClock, FiList } from "react-icons/fi";

interface FrontMatterProps {
  element: FrontMatterElement;
  attributes: RenderElementProps["attributes"];
  children: RenderElementProps["children"];
}

// 只有 description 可编辑，name 等字段只读
const EDITABLE_KEYS = new Set(["description"]);

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
    [editor, element, parsedValue],
  );

  // 处理本地输入变化
  const handleLocalChange = useCallback((key: string, newValue: string) => {
    setLocalValues((prev) => ({ ...prev, [key]: newValue }));
  }, []);

  // 获取显示值（优先使用本地编辑值）
  const getDisplayValue = useCallback(
    (key: string) => {
      if (key in localValues) {
        return localValues[key];
      }
      return String(parsedValue[key] ?? "");
    },
    [localValues, parsedValue],
  );

  // 处理失焦时提交
  const handleBlur = useCallback(
    (key: string) => {
      if (key in localValues) {
        commitValue(key, localValues[key]);
        // 清除本地状态
        setLocalValues((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    },
    [localValues, commitValue],
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
        <div className={styles.tagContainer}>
          {value.map((tag, index) => (
            <span key={index} className={styles.tag}>
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
      return (
        <span className={styles.frontMatterValue}>{JSON.stringify(value)}</span>
      );
    }

    const stringValue = String(value ?? "");

    // 只读模式或非可编辑字段：显示纯文本
    if (readOnly || !EDITABLE_KEYS.has(key)) {
      return <span className={styles.frontMatterValue}>{stringValue}</span>;
    }

    // 编辑模式：description 使用多行文本框
    if (key === "description") {
      return (
        <textarea
          className={classNames(
            styles.frontMatterValue,
            styles.frontMatterTextarea,
          )}
          value={getDisplayValue(key)}
          onChange={(e) => handleLocalChange(key, e.target.value)}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={(e) => {
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
        className={classNames(styles.frontMatterValue, styles.frontMatterInput)}
        value={getDisplayValue(key)}
        onChange={(e) => handleLocalChange(key, e.target.value)}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={(e) => {
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
      className={classNames(styles.frontMatter, {
        [styles.editable]: !readOnly,
      })}
      contentEditable={false}
    >
      <div className={styles.frontMatterContent}>
        <div className={styles.frontMatterData}>
          {Object.entries(parsedValue).map(([key, value]) => (
            <div key={key} className={styles.frontMatterItem}>
              <span className={styles.frontMatterKey}>
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
