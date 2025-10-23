import { memo, useEffect, useRef } from "react";
import { Flex, Tag } from "antd";
import classnames from "classnames";
import Editor from "@/components/Editor";
import ErrorBoundary from "@/components/ErrorBoundary";
import IExtension from "@/components/Editor/extensions/types";
import { SearchResult } from "@/types";
import { formatDate } from "@/utils";
import useTheme from "@/hooks/useTheme";

import styles from "./index.module.less";

interface IItemProps {
  item: SearchResult;
  active: boolean;
  extensions: IExtension[];
  onClick?: () => void;
}

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
      <Flex gap={8} align="center" className={styles.titleContainer}>
        <div>
          <Tag color="blue">{item.type}</Tag>
        </div>
        <div className={styles.title}>{item.title}</div>
      </Flex>
      <div className={styles.time}>
        <span>更新于：{formatDate(item.updateTime, true)}</span>
      </div>
      <ErrorBoundary>
        <div className={styles.content}>
          <Editor
            readonly={true}
            initValue={item.content.slice(0, 2)}
            extensions={extensions}
            theme={theme}
          />
        </div>
      </ErrorBoundary>
    </div>
  );
});

export default Item;
