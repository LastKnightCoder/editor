import { useRef } from "react";
import SVG from "react-inlinesvg";
import { App, Tooltip } from "antd";
import { useMemoizedFn } from "ahooks";
import imageIcon from "@/assets/white-board/image.svg";

import { useBoard } from "../../../hooks";
import { ImageUtil } from "../../../utils";

interface ImageProps {
  className?: string;
  style?: React.CSSProperties;
}

const Image = (props: ImageProps) => {
  const { className, style } = props;
  const board = useBoard();

  const imageInputRef = useRef<HTMLInputElement>(null);

  const { message } = App.useApp();

  const handleAddImage = useMemoizedFn(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        message.loading({
          key: "uploading-image",
          content: "正在处理图片，请稍候...",
          duration: 0,
        });
        await ImageUtil.insertImage(file, board);
        message.destroy("uploading-image");
      }
      event.target.value = "";
    },
  );

  return (
    <Tooltip title="图片">
      <div
        className={className}
        style={style}
        onClick={() => {
          imageInputRef.current?.click();
        }}
      >
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleAddImage}
        />
        <SVG src={imageIcon} />
      </div>
    </Tooltip>
  );
};

export default Image;
