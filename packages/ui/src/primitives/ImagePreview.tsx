import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogBody } from "./Dialog";
import { IconButton } from "./IconButton";
import { useUiI18n } from "../i18n";
import type { ComponentType } from "react";

const NativeImage = (props: { src: string; alt: string; className?: string }) => <img {...props} />;

export function ImagePreview({
  images,
  index,
  onIndexChange,
  open,
  onOpenChange,
  ImageComponent = NativeImage,
}: {
  images: readonly { src: string; alt?: string }[];
  index: number;
  onIndexChange: (index: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ImageComponent?: ComponentType<{ src: string; alt: string; className?: string }>;
}) {
  const { t } = useUiI18n();
  const move = (delta: number) => {
    if (images.length) onIndexChange((index + delta + images.length) % images.length);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("imagePreview.title")}
      width={900}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          event.stopPropagation();
          move(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
    >
      <DialogBody>
        <div className="flex items-center gap-3">
          <IconButton
            aria-label={t("imagePreview.prev")}
            disabled={images.length < 2}
            onClick={() => move(-1)}
          >
            <ChevronLeft size={18} />
          </IconButton>
          {images[index] && (
            <ImageComponent
              src={images[index].src}
              alt={images[index].alt ?? t("imagePreview.defaultAlt")}
              className="max-h-[65vh] min-w-0 flex-1 object-contain"
            />
          )}
          <IconButton
            aria-label={t("imagePreview.next")}
            disabled={images.length < 2}
            onClick={() => move(1)}
          >
            <ChevronRight size={18} />
          </IconButton>
        </div>
      </DialogBody>
    </Dialog>
  );
}
