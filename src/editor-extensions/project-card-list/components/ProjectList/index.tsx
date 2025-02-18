import { useState } from 'react';
import { Empty, message } from "antd";
import { useAsyncEffect } from "ahooks";
import ItemCard from '@/editor-extensions/components/ItemCard';

import { getProjectItemsByIds, getProjectItemById } from "@/commands";
import { ProjectItem } from "@/types";

import styles from './index.module.less';

interface IProps {
  projectItemId: number;
  onClick: (item: ProjectItem, index: number) => void;
}

const DocumentList = (props: IProps) => {
  const { projectItemId, onClick } = props;

  const [items, setItems] = useState<ProjectItem[]>([]);

  useAsyncEffect(async () => {
    if (!projectItemId) return;
    const projectItem = await getProjectItemById(projectItemId);
    if (!projectItem) return;
    const { children } = projectItem;

    try {
      const items = await getProjectItemsByIds(children);
      // 根据 children 的顺序重排序
      items.sort((a, b) => {
        const indexA = children.indexOf(a.id);
        const indexB = children.indexOf(b.id);
        return indexA - indexB;
      });
      setItems(items);
    } catch (e) {
      console.error(e);
      message.error('ProjectItems 拉取失败' + e);
    }
  }, [projectItemId]);

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
          <ItemCard
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
