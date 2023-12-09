import { useState } from 'react';
import { Empty, message } from "antd";
import { useAsyncEffect, useWhyDidYouUpdate } from "ahooks";
import DocumentCard from '../DocumentCard';

import { getDocumentItemsByIds, getDocumentItem } from "@/commands";
import { IDocumentItem } from "@/types";

import styles from './index.module.less';

interface IProps {
  documentItemId: number;
  onClick: (item: IDocumentItem, index: number) => void;
}

const DocumentList = (props: IProps) => {
  const { documentItemId, onClick } = props;

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<IDocumentItem[]>([]);

  useWhyDidYouUpdate('DocumentList', {
    documentItemId,
    items,
    loading,
    onClick
  })

  useAsyncEffect(async () => {
    if (!documentItemId) return;
    const documentItem = await getDocumentItem(documentItemId);
    if (!documentItem) return;
    const { children } = documentItem;

    setLoading(true);
    try {
      const items = await getDocumentItemsByIds(children);
      setItems(items);
    } catch (e) {
      console.error(e);
      message.error('DocumentItems 拉取失败' + e);
    } finally {
      setLoading(false);
    }
  }, [documentItemId]);

  if (items.length === 0) {
    return (
      <div contentEditable={false} style={{ userSelect: 'none' }}>
        <Empty description={'暂无子文档'} />
      </div>
    )
  }

  return (
    <div className={styles.list}>
      {
        items.map((item, i) => (
          <DocumentCard
            key={item.id}
            item={item}
            onClick={() => onClick(item, i)}
          />
        ))
      }
    </div>
  )
}

export default DocumentList;