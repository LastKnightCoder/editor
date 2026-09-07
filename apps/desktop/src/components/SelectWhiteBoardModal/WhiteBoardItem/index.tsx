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

const defaultSnapshot = "https://d2hulr7xnfjroe.cloudfront.net/Frame_1321315996_35405ab097.png";

const WhiteBoardItem = memo((props: WhiteBoardItemProps) => {
  const { whiteBoard, onClick, onDelete, active = false, showDelete = true } = props;
  const { updateTime, tags, title, description, snapshot } = whiteBoard;

  return (
    <div
      className={classnames(
        "relative flex cursor-pointer flex-col overflow-hidden rounded-2xl transition-all",
        "h-[340px]", // 固定卡片高度
        "bg-white dark:bg-zinc-800",
        "shadow-[0_1.5px_3px_0_rgba(0,0,0,0.15)] hover:shadow-[0_3px_6px_0_rgba(0,0,0,0.15)]",
        {
          "from-[var(--th-accent-soft)]/50 bg-gradient-to-br to-transparent": active,
        }
      )}
      onClick={onClick}
    >
      {/* 选中标识 - 右上角 */}
      <If condition={active}>
        <div className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--th-accent)] text-white shadow-lg">
          <CheckCircleFilled className="text-lg" />
        </div>
      </If>

      {/* 删除按钮 - 只在显示删除且未选中时显示在右上角 */}
      <If condition={showDelete && !active}>
        <div
          onClick={e => {
            e.stopPropagation();
            onDelete && onDelete(e);
          }}
          className="absolute right-2 top-2 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-gray-100/90 text-gray-500 transition-all hover:bg-gray-200 hover:text-gray-700 dark:bg-zinc-700/90 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-gray-200"
        >
          <CloseOutlined />
        </div>
      </If>

      {/* 封面图 - 固定高度 */}
      <div className="h-[180px] w-full shrink-0 overflow-hidden bg-gray-50 dark:bg-zinc-900">
        <LocalImage url={snapshot || defaultSnapshot} />
      </div>

      {/* 内容区域 - 固定高度，超出隐藏 */}
      <div className="flex flex-1 flex-col gap-2 overflow-hidden p-4">
        <div className="overflow-hidden text-ellipsis whitespace-nowrap text-lg font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </div>

        <If condition={tags && tags.length > 0}>
          <div className="shrink-0">
            <Tags tags={tags} showIcon />
          </div>
        </If>

        <div className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
          更新于 {formatDate(updateTime, true)}
        </div>

        <If condition={!!description}>
          <div className="line-clamp-2 overflow-hidden text-ellipsis text-sm leading-relaxed text-gray-600 dark:text-gray-300">
            {description}
          </div>
        </If>
      </div>
    </div>
  );
});

export default WhiteBoardItem;
