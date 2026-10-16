import { ImageOff } from "lucide-react";
import { Spinner, cn } from "@tau/ui";
import { useUploadImageUrl } from "./uploadQueries";

/** 已上传图片的预览（图标 / 截图） */
export function UploadImage({
  id,
  alt,
  className,
}: {
  id: string;
  alt: string;
  className?: string;
}) {
  const { url, isError } = useUploadImageUrl(id);
  return (
    <div
      className={cn("bg-hover rounded-tau-sm grid place-items-center overflow-hidden", className)}
    >
      {url ? (
        <img src={url} alt={alt} className="size-full object-cover" />
      ) : isError ? (
        <span
          className="text-ink-3 flex flex-col items-center gap-1 p-2 text-center"
          title="无法预览"
        >
          <ImageOff size={16} strokeWidth={1.75} />
          <span className="text-tau-tiny">无法预览</span>
        </span>
      ) : (
        <Spinner />
      )}
    </div>
  );
}
