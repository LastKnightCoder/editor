import { memo } from "react";
import { Popover, Button, Space } from "antd";
import { DeleteOutlined, FormatPainterOutlined } from "@ant-design/icons";
import useTheme from "@/hooks/useTheme";
import type {
  WeReadHighlightStyle,
  WeReadColorStyle,
} from "../../types/elements";
import { colorStyleMap } from "./HighlightText";

interface BookmarkToolbarProps {
  style: WeReadHighlightStyle;
  colorStyle: WeReadColorStyle;
  hasReview: boolean;
  onDelete: () => void;
  onDeleteReview?: () => void;
  onUpdateStyle: (style: WeReadHighlightStyle) => void;
  onUpdateColor: (colorStyle: WeReadColorStyle) => void;
}

const styleNames = {
  0: "下划线",
  1: "背景高亮",
  2: "波浪线",
};

export const BookmarkToolbar: React.FC<BookmarkToolbarProps> = memo((props) => {
  const {
    style,
    colorStyle,
    hasReview,
    onDelete,
    onDeleteReview,
    onUpdateStyle,
    onUpdateColor,
  } = props;
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const borderColor = isDark ? "#3a3a3a" : "#e0e0e0";
  const bgColor = isDark ? "#2a2a2a" : "#ffffff";

  const colorOptions: WeReadColorStyle[] = [1, 2, 3, 4, 5];
  const styleOptions: WeReadHighlightStyle[] = [0, 1, 2];

  const ColorPicker = (
    <div
      style={{
        padding: "8px",
        backgroundColor: bgColor,
        borderRadius: "4px",
      }}
    >
      <div style={{ marginBottom: "8px", fontSize: "12px", color: "#888" }}>
        颜色
      </div>
      <Space>
        {colorOptions.map((cs) => {
          const { color, name } = isDark
            ? colorStyleMap.dark[cs]
            : colorStyleMap.light[cs];
          return (
            <div
              key={cs}
              onClick={() => onUpdateColor(cs)}
              style={{
                width: "24px",
                height: "24px",
                backgroundColor: color,
                borderRadius: "4px",
                cursor: "pointer",
                border:
                  cs === colorStyle
                    ? "2px solid #1890ff"
                    : `1px solid ${borderColor}`,
              }}
              title={name}
            />
          );
        })}
      </Space>

      <div
        style={{
          marginTop: "12px",
          marginBottom: "8px",
          fontSize: "12px",
          color: "#888",
        }}
      >
        样式
      </div>
      <Space direction="vertical" style={{ width: "100%" }}>
        {styleOptions.map((st) => (
          <Button
            key={st}
            size="small"
            type={st === style ? "primary" : "default"}
            onClick={() => onUpdateStyle(st)}
            block
          >
            {styleNames[st]}
          </Button>
        ))}
      </Space>
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        gap: "4px",
        padding: "4px 8px",
        borderTop: `1px solid ${borderColor}`,
      }}
      contentEditable={false}
    >
      <Popover content={ColorPicker} trigger="click" placement="bottomLeft">
        <Button size="small" icon={<FormatPainterOutlined />} type="text">
          样式
        </Button>
      </Popover>

      {hasReview && onDeleteReview && (
        <Button size="small" type="text" onClick={onDeleteReview} danger>
          删除评论
        </Button>
      )}

      <Button
        size="small"
        icon={<DeleteOutlined />}
        type="text"
        onClick={onDelete}
        danger
      >
        删除高亮
      </Button>
    </div>
  );
});

BookmarkToolbar.displayName = "BookmarkToolbar";
