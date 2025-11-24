import { memo } from "react";
import { CloseOutlined, CheckCircleFilled } from "@ant-design/icons";
import classnames from "classnames";

import { WhiteBoard } from "@/types";
import If from "@/components/If";
import Tags from "@/components/Tags";
import LocalImage from "@/components/LocalImage";

import { formatDate } from "@/utils/time.ts";

interface WhiteBoardItemProps {
  whiteBoard: WhiteBoard;
  onClick?: (e: React.MouseEvent) => void;
  active?: boolean;
  onDelete?: (e: React.MouseEvent) => void;
  showDelete?: boolean;
}

const defaultSnapshot =
  "https://d2hulr7xnfjroe.cloudfront.net/Frame_1321315996_35405ab097.png";

const WhiteBoardItem = memo((props: WhiteBoardItemProps) => {
  const {
    whiteBoard,
    onClick,
    onDelete,
    active = false,
    showDelete = true,
  } = props;
  const { updateTime, tags, title, description, snapshot } = whiteBoard;

  return (
    <div
      className={classnames(
        "relative flex flex-col rounded-2xl cursor-pointer transition-all overflow-hidden",
        "h-[340px]", // 固定卡片高度
        "bg-white dark:bg-gray-800",
        "shadow-[0_1.5px_3px_0_rgba(0,0,0,0.15)] hover:shadow-[0_3px_6px_0_rgba(0,0,0,0.15)]",
        {
          "bg-gradient-to-br from-blue-50/50 to-transparent dark:from-blue-900/20":
            active,
        },
      )}
      onClick={onClick}
    >
      {/* 选中标识 - 右上角 */}
      <If condition={active}>
        <div className="absolute top-2 right-2 w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white shadow-lg z-10">
          <CheckCircleFilled className="text-lg" />
        </div>
      </If>

      {/* 删除按钮 - 只在显示删除且未选中时显示在右上角 */}
      <If condition={showDelete && !active}>
        <div
          onClick={(e) => {
            e.stopPropagation();
            onDelete && onDelete(e);
          }}
          className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100/90 dark:bg-gray-700/90 text-gray-500 dark:text-gray-400 cursor-pointer transition-all hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-700 dark:hover:text-gray-200 z-10"
        >
          <CloseOutlined />
        </div>
      </If>

      {/* 封面图 - 固定高度 */}
      <div className="w-full h-[180px] flex-shrink-0 overflow-hidden bg-gray-50 dark:bg-gray-900">
        <LocalImage url={snapshot || defaultSnapshot} />
      </div>

      {/* 内容区域 - 固定高度，超出隐藏 */}
      <div className="flex-1 p-4 flex flex-col gap-2 overflow-hidden">
        <div className="font-semibold text-lg overflow-hidden text-ellipsis whitespace-nowrap text-gray-900 dark:text-gray-100">
          {title}
        </div>

        <If condition={tags && tags.length > 0}>
          <div className="flex-shrink-0">
            <Tags tags={tags} showIcon />
          </div>
        </If>

        <div className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
          更新于 {formatDate(updateTime, true)}
        </div>

        <If condition={!!description}>
          <div className="text-sm text-gray-600 dark:text-gray-300 overflow-hidden text-ellipsis line-clamp-2 leading-relaxed">
            {description}
          </div>
        </If>
      </div>
    </div>
  );
});

export default WhiteBoardItem;
