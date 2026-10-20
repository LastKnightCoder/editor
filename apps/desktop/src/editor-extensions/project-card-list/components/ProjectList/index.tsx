import { useState } from "react";
import { DocumentCardGrid, toast } from "@tau/ui";
import { useAsyncEffect } from "ahooks";
import ItemCard from "@/editor-extensions/components/ItemCard";

import { getProjectItemsByIds, getProjectItemById } from "@/commands";
import { ProjectItem } from "@/types";

interface IProps {
  projectItemId: number;
  onClick: (item: ProjectItem, index: number) => void;
}

const ProjectList = (props: IProps) => {
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
      toast.error("ProjectItems 拉取失败" + e);
    }
  }, [projectItemId]);

  if (items.length === 0) {
    return (
      <div contentEditable={false} style={{ userSelect: "none" }}>
        <p className="text-ink-3 py-6 text-center text-xs">暂无子文档</p>
      </div>
    );
  }

  return (
    <DocumentCardGrid>
      {items.map((item, i) => (
        <ItemCard key={item.id} item={item} onClick={() => onClick(item, i)} />
      ))}
    </DocumentCardGrid>
  );
};

export default ProjectList;
