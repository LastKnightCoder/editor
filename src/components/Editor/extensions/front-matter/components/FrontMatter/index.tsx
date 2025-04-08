import { useMemo } from "react";
import { RenderElementProps } from "slate-react";
import classNames from "classnames";
import YAML from "yaml";
import { FrontMatterElement } from "@/components/Editor/types";
import styles from "./index.module.less";
import { FiTag, FiAlignLeft, FiClock, FiList } from "react-icons/fi";

interface FrontMatterProps {
  element: FrontMatterElement;
  attributes: RenderElementProps["attributes"];
  children: RenderElementProps["children"];
}

const FrontMatter = (props: FrontMatterProps) => {
  const { attributes, children, element } = props;

  const { value } = element;

  const parsedValue: Record<string, any> = useMemo(() => {
    try {
      const parsed = YAML.parse(value);
      return parsed || {};
    } catch (e) {
      console.error("Error parsing front matter:", e);
    }
    return {};
  }, [value]);

  const getIconForKey = (key: string) => {
    switch (key) {
      case "title":
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

  return (
    <div
      {...attributes}
      className={classNames(styles.frontMatter)}
      contentEditable={false}
    >
      <div className={styles.frontMatterContent}>
        <div className={styles.frontMatterData}>
          {Object.entries(parsedValue).map(([key, value]) => (
            <div key={key} className={styles.frontMatterItem}>
              <span className={styles.frontMatterKey}>
                {getIconForKey(key)} {key}
              </span>
              <span className={styles.frontMatterValue}>
                {key === "tags"
                  ? renderTagsValue(value)
                  : typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value)}
              </span>
            </div>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
};

export default FrontMatter;
