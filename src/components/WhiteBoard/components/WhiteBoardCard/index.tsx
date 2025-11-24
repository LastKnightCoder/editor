import { memo, useState, useEffect } from "react";
import { Board } from "../../types";
import { WhiteBoardElement } from "../../plugins/WhiteBoardPlugin";
import { getWhiteBoardContentById } from "@/commands/white-board";
import { WhiteBoardContent } from "@/types";
import { Spin, Empty } from "antd";
import LocalImage from "@/components/LocalImage";
import { useMemoizedFn } from "ahooks";
import { navigateTo } from "@/utils/navigation";
import { TabType } from "@/types/tab";
import useTabParams from "@/hooks/useTabParams";

interface WhiteBoardCardProps {
  board: Board;
  element: WhiteBoardElement;
}

const defaultSnapshot =
  "https://d2hulr7xnfjroe.cloudfront.net/Frame_1321315996_35405ab097.png";

const WhiteBoardCard = memo((props: WhiteBoardCardProps) => {
  const { element, board } = props;
  const {
    x,
    y,
    width,
    height,
    whiteBoardContentId,
    name,
    description,
    snapshot,
  } = element;

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
            backgroundColor: "white",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          }}
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
            backgroundColor: "white",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          }}
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
          backgroundColor: "white",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          overflow: "hidden",
          cursor: "pointer",
          transition: "all 0.2s",
        }}
        onDoubleClick={handleDoubleClick}
        className="hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
      >
        {/* 封面图 */}
        <div
          style={{
            width: "100%",
            height: "60%",
            overflow: "hidden",
            backgroundColor: "#f5f5f5",
          }}
        >
          <LocalImage
            url={snapshot || whiteBoardContent.imgUrl || defaultSnapshot}
          />
        </div>

        {/* 信息区域 */}
        <div
          style={{
            padding: "12px",
            height: "40%",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div
            style={{
              fontWeight: 600,
              fontSize: "14px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name || whiteBoardContent.name}
          </div>
          {description && (
            <div
              style={{
                fontSize: "12px",
                color: "#666",
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {description}
            </div>
          )}
        </div>
      </div>
    </foreignObject>
  );
});

export default WhiteBoardCard;
