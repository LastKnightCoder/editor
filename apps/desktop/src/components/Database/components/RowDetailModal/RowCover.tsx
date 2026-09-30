import { useState } from "react";
import LocalImage from "@/components/LocalImage";
import { coverGradientOfKey } from "@/utils/cover";
import type { ImageItem } from "../../plugins/ImagePlugin/types";

interface RowCoverProps {
  rowId: string;
  image: ImageItem;
  onPreview: () => void;
}

/** 属性栏顶部封面：派生渐变垫底（加载中、加载失败时露出，与画廊卡同色），图片铺在其上 */
const RowCover = ({ rowId, image, onPreview }: RowCoverProps) => {
  // 记失败的 url 而非布尔：换图后自动重试
  const [failedUrl, setFailedUrl] = useState<string>();
  const failed = failedUrl === image.url;

  return (
    <button
      type="button"
      aria-label="查看封面"
      disabled={failed}
      onClick={onPreview}
      className="rounded-tau-md relative mb-4 ml-2 block aspect-[4/3] w-[calc(100%-8px)] max-w-[288px] cursor-zoom-in overflow-hidden disabled:cursor-default"
      style={{ backgroundImage: coverGradientOfKey(rowId) }}
    >
      {!failed && (
        <LocalImage
          url={image.url}
          alt={image.alt || "封面"}
          className="absolute inset-0 size-full object-cover"
          onLoadError={() => setFailedUrl(image.url)}
        />
      )}
    </button>
  );
};

export default RowCover;
