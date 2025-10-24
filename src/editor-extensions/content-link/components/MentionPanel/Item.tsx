import { memo, useEffect, useRef } from "react";
import { Tag } from "antd";
import classnames from "classnames";
import Editor from "@/components/Editor";
import ErrorBoundary from "@/components/ErrorBoundary";
import IExtension from "@/components/Editor/extensions/types";
import { SearchResult } from "@/types";
import useTheme from "@/hooks/useTheme";

import styles from "./index.module.less";

interface IItemProps {
  item: SearchResult;
  active: boolean;
  extensions: IExtension[];
  onClick?: () => void;
}

const typeMap: Record<string, string> = {
  card: "卡片",
  article: "文章",
  "project-item": "项目",
  "document-item": "文档",
};

const Item = memo((props: IItemProps) => {
  const { item, active, extensions, onClick } = props;
  const ref = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (active) {
      // 滚动到可视区域
      ref.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "start",
      });
    }
  }, [active]);

  return (
    <div
      onClick={onClick}
      ref={ref}
      className={classnames(styles.item, { [styles.active]: active })}
    >
      <div className={styles.typeTag}>
        <Tag color="blue">{typeMap[item.type] || item.type}</Tag>
      </div>
      <ErrorBoundary>
        <div className={styles.content}>
          <Editor
            readonly={true}
            initValue={item.content.slice(0, 1)}
            extensions={extensions}
            theme={theme}
          />
        </div>
      </ErrorBoundary>
    </div>
  );
});

export default Item;
