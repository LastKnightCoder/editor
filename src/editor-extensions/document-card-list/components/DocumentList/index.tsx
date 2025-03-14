import { useState } from "react";
import { Empty, message } from "antd";
import { useAsyncEffect } from "ahooks";
import ItemCard from "@/editor-extensions/components/ItemCard";

import { getDocumentItemsByIds, getDocumentItem } from "@/commands";
import { IDocumentItem } from "@/types";

import styles from "./index.module.less";

interface IProps {
  documentItemId: number;
  onClick: (item: IDocumentItem, index: number) => void;
}

const DocumentList = (props: IProps) => {
  const { documentItemId, onClick } = props;

  const [items, setItems] = useState<IDocumentItem[]>([]);

  useAsyncEffect(async () => {
    if (!documentItemId) return;
    const documentItem = await getDocumentItem(documentItemId);
    if (!documentItem) return;
    const { children } = documentItem;

    try {
      const items = await getDocumentItemsByIds(children);
      // 根据 children 的顺序重排序
      items.sort((a, b) => {
        const indexA = children.indexOf(a.id);
        const indexB = children.indexOf(b.id);
        return indexA - indexB;
      });
      setItems(items);
    } catch (e) {
      console.error(e);
      message.error("DocumentItems 拉取失败" + e);
    }
  }, [documentItemId]);

  if (items.length === 0) {
    return (
      <div contentEditable={false} style={{ userSelect: "none" }}>
        <Empty description={"暂无子文档"} />
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {items.map((item, i) => (
        <ItemCard key={item.id} item={item} onClick={() => onClick(item, i)} />
      ))}
    </div>
  );
};

export default DocumentList;
