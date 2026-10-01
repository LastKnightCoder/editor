import { useMemoizedFn } from "ahooks";
import { PortalToBody } from "@tau/shared";
import { cn, lockBodyScroll } from "@tau/ui";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect } from "react";
import { useSlateStatic } from "slate-react";
import { OverlayBackDismiss } from "@tau/editor/api";

import { useImagesOverviewStore } from "../../stores/index";
import { useEditorSlots } from "../../services/hooks";

// 灯箱固定深色遮罩 + 白色图标，不随主题（浅色主题的 overlay 太淡，白图标会看不清）
const navButtonClass =
  "absolute flex cursor-pointer items-center justify-center rounded-full bg-[rgba(0,0,0,0.2)] hover:bg-[rgba(0,0,0,0.3)]";
const sideButtonClass = cn(navButtonClass, "top-1/2 h-[56px] w-[56px] -translate-y-1/2");
const imageClass =
  "max-h-[90vh] max-w-full cursor-zoom-out object-contain object-center shadow-[0_5px_11px_0_rgba(0,0,0,0.18),0_4px_15px_0_rgba(0,0,0,0.15)]";

const ImagesOverview = () => {
  const ownEditor = useSlateStatic();
  const {
    editor,
    release,
    isShowImagesOverview,
    imageElements,
    hasNextImage,
    hasPrevImage,
    currentImageIndex,
    switchImage,
    closeImagesOverview,
  } = useImagesOverviewStore(state => ({
    editor: state.editor,
    release: state.release,
    isShowImagesOverview: state.isShowImagesOverview,
    imageElements: state.imageElements,
    hasNextImage: state.hasNextImage,
    hasPrevImage: state.hasPrevImage,
    currentImageIndex: state.currentImageIndex,
    switchImage: state.switchImage,
    closeImagesOverview: state.closeImagesOverview,
  }));

  const { Image } = useEditorSlots();
  const open = isShowImagesOverview && editor === ownEditor;
  const currentImage = imageElements[currentImageIndex];

  useEffect(() => () => release(ownEditor), [ownEditor, release]);
  useEffect(() => {
    if (!open) return;
    return lockBodyScroll(document);
  }, [open]);

  const switchNext = useMemoizedFn(() => {
    switchImage(true);
  });

  const switchPrev = useMemoizedFn(() => {
    switchImage(false);
  });

  if (!open || !currentImage) return null;

  return (
    <div>
      <OverlayBackDismiss open={open} onDismiss={closeImagesOverview} />
      <PortalToBody>
        <div className="fixed inset-0 z-[1002] flex items-center justify-center text-white">
          <div
            className="absolute inset-0 bg-[rgba(0,0,0,0.6)]"
            onClick={closeImagesOverview}
          ></div>
          <div className="relative z-[2] w-fit max-w-[80%]" onClick={closeImagesOverview}>
            {Image ? (
              <Image url={currentImage.url} alt={currentImage.alt} className={imageClass} />
            ) : (
              <img src={currentImage.url} alt={currentImage.alt} className={imageClass} />
            )}
          </div>
          <div
            className={cn(navButtonClass, "right-[15px] top-[15px] h-[46px] w-[46px]")}
            onClick={closeImagesOverview}
          >
            <X size="1em" />
          </div>
          <div
            className={cn(sideButtonClass, "left-[10px]", !hasPrevImage && "hidden")}
            onClick={switchPrev}
          >
            <ChevronLeft size="1em" />
          </div>
          <div
            className={cn(sideButtonClass, "right-[10px]", !hasNextImage && "hidden")}
            onClick={switchNext}
          >
            <ChevronRight size="1em" />
          </div>
        </div>
      </PortalToBody>
    </div>
  );
};

export default ImagesOverview;
