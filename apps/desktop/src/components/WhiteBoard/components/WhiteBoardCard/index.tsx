import { memo, useState, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { Layout } from "lucide-react";

import { Board } from "../../types";
import { WhiteBoardElement } from "../../plugins/WhiteBoardPlugin";
import { getWhiteBoardContentById } from "@/commands/white-board";
import { WhiteBoardContent } from "@/types";
import { Spin, Empty } from "antd";
import LocalImage from "@/components/LocalImage";
import { navigateTo } from "@/utils/navigation";
import { TabType } from "@/types/tab";
import useTabParams from "@/hooks/useTabParams";
import useTheme from "@/hooks/useTheme";

interface WhiteBoardCardProps {
  board: Board;
  element: WhiteBoardElement;
}

const defaultSnapshot =
  "https://d2hulr7xnfjroe.cloudfront.net/Frame_1321315996_35405ab097.png";

// 固定高度常量
export const WHITEBOARD_CARD_HEIGHT = 80;

const WhiteBoardCard = memo((props: WhiteBoardCardProps) => {
  const { element, board } = props;
  const { isDark } = useTheme();
  const { x, y, width, whiteBoardContentId, name, description, snapshot } =
    element;

  // 固定高度
  const height = WHITEBOARD_CARD_HEIGHT;

  // 获取当前页面的 breadcrumb
  const tabParams = useTabParams(TabType.WhiteBoardDetail);

  // 从 board 的 resourceSource 获取当前的 whiteboardContentId
  const currentContentId =
    board.resourceSource?.type === "whiteboard"
      ? board.resourceSource.id
      : undefined;

  // 如果是 content 类型，使用 TabParams 的 breadcrumb，否则为空数组
  const currentBreadcrumb =
    tabParams.type === "content" ? tabParams.breadcrumb || [] : [];

  const [loading, setLoading] = useState(false);
  const [whiteBoardContent, setWhiteBoardContent] =
    useState<WhiteBoardContent | null>(null);

  useEffect(() => {
    setLoading(true);
    getWhiteBoardContentById(whiteBoardContentId)
      .then((content) => {
        setWhiteBoardContent(content);
      })
      .catch(() => {
        setWhiteBoardContent(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [whiteBoardContentId]);

  const handleDoubleClick = useMemoizedFn((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!whiteBoardContent) return;

    // 构建新的 breadcrumb：当前路径 + 当前白板内容 ID
    const newBreadcrumb = currentContentId
      ? [...currentBreadcrumb, currentContentId]
      : [];

    // 导航到引用的白板内容
    navigateTo(
      TabType.WhiteBoardDetail,
      {
        type: "content",
        whiteBoardContentId: whiteBoardContent.id,
        breadcrumb: newBreadcrumb,
      },
      whiteBoardContent.name,
    );
  });

  const backgroundColor = isDark ? "#2a2a2a" : "#ffffff";
  const textColor = isDark ? "#e5e5e5" : "#1f2937";
  const descriptionColor = isDark ? "#9ca3af" : "#6b7280";
  const borderColor = isDark ? "#404040" : "#e5e7eb";
  const iconBgColor = isDark ? "#fbbf24" : "#fbbf24";

  if (loading) {
    return (
      <foreignObject
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          overflow: "visible",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor,
            borderRadius: "8px",
            border: `1px solid ${borderColor}`,
          }}
          className="cursor-move"
        >
          <Spin />
        </div>
      </foreignObject>
    );
  }

  if (!whiteBoardContent) {
    return (
      <foreignObject
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          overflow: "visible",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor,
            borderRadius: "8px",
            border: `1px solid ${borderColor}`,
          }}
          className="cursor-move"
        >
          <Empty description="白板不存在" />
        </div>
      </foreignObject>
    );
  }

  return (
    <foreignObject
      x={x}
      y={y}
      width={width}
      height={height}
      style={{
        overflow: "visible",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          backgroundColor,
          borderRadius: "8px",
          border: `1px solid ${borderColor}`,
          overflow: "hidden",
          transition: "all 0.2s",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "12px",
        }}
        onDoubleClick={handleDoubleClick}
        className="cursor-move hover:shadow-md"
      >
        {/* 左侧图标 */}
        <div
          style={{
            width: "56px",
            height: "56px",
            flexShrink: 0,
            backgroundColor: iconBgColor,
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {snapshot || whiteBoardContent.imgUrl ? (
            <LocalImage
              url={snapshot || whiteBoardContent.imgUrl || defaultSnapshot}
              alt={name || whiteBoardContent.name}
              className="w-full h-full object-cover select-none"
              draggable={false}
            />
          ) : (
            <Layout size={28} color="#ffffff" strokeWidth={2} />
          )}
        </div>

        {/* 右侧文字区域 */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            justifyContent: "center",
          }}
        >
          {/* 标题 */}
          <div
            style={{
              fontWeight: 600,
              fontSize: "14px",
              color: textColor,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: "1.4",
            }}
            title={name || whiteBoardContent.name}
          >
            {name || whiteBoardContent.name}
          </div>

          {/* 描述 */}
          <div
            style={{
              fontSize: "12px",
              color: descriptionColor,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: "1.4",
            }}
            title={description || "0 cards"}
          >
            {description || "0 cards"}
          </div>
        </div>
      </div>
    </foreignObject>
  );
});

export default WhiteBoardCard;
