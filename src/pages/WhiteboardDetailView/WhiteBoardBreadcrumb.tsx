import { useEffect, useState } from "react";
import { Breadcrumb as AntBreadcrumb } from "antd";
import { useMemoizedFn } from "ahooks";
import { WhiteBoardContent } from "@/types";
import { getWhiteBoardContentById } from "@/commands/white-board";
import { navigateTo } from "@/utils/navigation";
import { TabType } from "@/types/tab";
import { HomeOutlined } from "@ant-design/icons";

interface WhiteBoardBreadcrumbProps {
  breadcrumb: number[];
  currentContentName: string;
}

const WhiteBoardBreadcrumb = (props: WhiteBoardBreadcrumbProps) => {
  const { breadcrumb, currentContentName } = props;
  const [contentMap, setContentMap] = useState<Map<number, WhiteBoardContent>>(
    new Map(),
  );

  useEffect(() => {
    // 加载 breadcrumb 中的所有 WhiteBoardContent
    const loadContents = async () => {
      const map = new Map<number, WhiteBoardContent>();
      for (const id of breadcrumb) {
        try {
          const content = await getWhiteBoardContentById(id);
          map.set(id, content);
        } catch (e) {
          // 忽略加载失败的内容
        }
      }
      setContentMap(map);
    };

    if (breadcrumb.length > 0) {
      loadContents();
    }
  }, [breadcrumb]);

  const handleBreadcrumbClick = useMemoizedFn((index: number) => {
    if (index === breadcrumb.length) {
      // 点击的是当前项，不需要导航
      return;
    }

    // 截取 breadcrumb 到点击的位置
    const newBreadcrumb = breadcrumb.slice(0, index);
    const targetContentId = breadcrumb[index];

    // 导航到目标 WhiteBoardContent
    navigateTo(TabType.WhiteBoardDetail, {
      type: "content",
      whiteBoardContentId: targetContentId,
      breadcrumb: newBreadcrumb,
    });
  });

  const items = [
    {
      title: (
        <span className="cursor-pointer hover:text-[var(--primary-color)]">
          <HomeOutlined />
        </span>
      ),
      onClick: () => {
        // 导航回白板列表
        navigateTo(TabType.WhiteBoardList);
      },
    },
    // 只有当 breadcrumb 有内容时才添加中间路径
    ...(breadcrumb.length > 0
      ? breadcrumb.map((id, index) => ({
          title: (
            <span
              className="cursor-pointer hover:text-[var(--primary-color)]"
              onClick={() => handleBreadcrumbClick(index)}
            >
              {contentMap.get(id)?.name || `白板 ${id}`}
            </span>
          ),
        }))
      : []),
    // 当前页面
    {
      title: <span>{currentContentName}</span>,
    },
  ];

  return (
    <div className="px-4 py-2 border-b border-[#f0f0f0] dark:border-[#2a2a2a]">
      <AntBreadcrumb items={items} />
    </div>
  );
};

export default WhiteBoardBreadcrumb;
