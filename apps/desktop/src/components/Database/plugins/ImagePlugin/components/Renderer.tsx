import React, { memo, useState, useRef, useEffect } from "react";
import { Popover as TauPopover } from "@tau/ui";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import LocalImage from "@/components/LocalImage";
import useUploadResource from "@/hooks/useUploadResource";
import { ColumnDef } from "../../../types";
import { ImagePluginValue, ImageItem } from "../types";
import ImageUpload from "./ImageUpload";
import { v4 as uuid } from "uuid";
import { useMemoizedFn } from "ahooks";
import PortalToBody from "@/components/PortalToBody";

interface ImageRendererProps {
  value: ImagePluginValue;
  column: ColumnDef;
  theme: "light" | "dark";
  readonly: boolean;
  onCellValueChange: (newValue: ImagePluginValue) => void;
}

const ImageRenderer: React.FC<ImageRendererProps> = memo(
  ({ value, readonly, onCellValueChange }) => {
    const imageList = Array.isArray(value) ? value : [];
    const [previewVisible, setPreviewVisible] = useState(false);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [uploadPopoverVisible, setUploadPopoverVisible] = useState(false);
    const [hoveredImageId, setHoveredImageId] = useState<string | null>(null);
    const [slideDirection, setSlideDirection] = useState<"left" | "right">("right");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const addTriggerRef = useRef<HTMLDivElement>(null);
    const uploadResource = useUploadResource();

    const handleImageClick = useMemoizedFn((index: number) => {
      setPreviewIndex(index);
      setPreviewVisible(true);
    });

    const handlePrevImage = useMemoizedFn(() => {
      setSlideDirection("left");
      setPreviewIndex(prev => (prev === 0 ? imageList.length - 1 : prev - 1));
    });

    const handleNextImage = useMemoizedFn(() => {
      setSlideDirection("right");
      setPreviewIndex(prev => (prev === imageList.length - 1 ? 0 : prev + 1));
    });

    const handleKeyDown = useMemoizedFn((e: KeyboardEvent) => {
      if (!previewVisible) return;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          handlePrevImage();
          break;
        case "ArrowRight":
          e.preventDefault();
          handleNextImage();
          break;
        case "Escape":
          e.preventDefault();
          setPreviewVisible(false);
          break;
      }
    });

    useEffect(() => {
      if (previewVisible) {
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
      }
    }, [previewVisible, handleKeyDown]);

    const handleDeleteImage = useMemoizedFn((imageId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const newValue = imageList.filter(item => item.id !== imageId);
      onCellValueChange(newValue);
    });

    const handleUploadImage = useMemoizedFn(() => {
      fileInputRef.current?.click();
      setUploadPopoverVisible(false);
    });

    const handleFileChange = useMemoizedFn(async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      const newImages: ImageItem[] = [];

      for (const file of Array.from(files)) {
        try {
          const url = await uploadResource(file);
          if (url) {
            newImages.push({
              id: uuid(),
              url,
              alt: file.name,
            });
          }
        } catch (error) {
          console.error("上传图片失败:", error);
        }
      }

      if (newImages.length > 0) {
        onCellValueChange([...imageList, ...newImages]);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    });

    const handleAddLink = useMemoizedFn((link: string) => {
      const newImage: ImageItem = {
        id: uuid(),
        url: link,
        alt: "网络图片",
      };

      onCellValueChange([...imageList, newImage]);
      setUploadPopoverVisible(false);
    });

    return (
      <div className="relative flex h-full w-full items-center gap-2 px-2 py-1">
        <div className="flex flex-1 flex-nowrap items-center gap-2">
          {imageList.map((image, index) => (
            <motion.div
              key={image.id}
              className="group relative flex-none cursor-pointer"
              onMouseEnter={() => setHoveredImageId(image.id)}
              onMouseLeave={() => setHoveredImageId(null)}
              onClick={() => handleImageClick(index)}
            >
              <LocalImage
                url={image.url}
                alt={image.alt || "图片"}
                className="border-line-1 hover:shadow-lift h-8 w-8 rounded border object-cover transition-shadow"
              />

              <AnimatePresence>
                {!readonly && hoveredImageId === image.id && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="bg-ink-1/70 text-ink-inverse absolute -right-1 -top-1 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full shadow-lg"
                    onClick={e => handleDeleteImage(image.id, e)}
                  >
                    <X className="h-2 w-2" strokeWidth={2.5} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>

        {!readonly && (
          <TauPopover
            anchor={addTriggerRef.current}
            placement="bottom-end"
            open={uploadPopoverVisible}
            onOpenChange={setUploadPopoverVisible}
            arrow={false}
          >
            <ImageUpload onUploadLocal={handleUploadImage} onAddLink={handleAddLink} />
          </TauPopover>
        )}
        {!readonly && (
          <div
            ref={addTriggerRef}
            className="bg-hover hover:bg-press text-ink-2 hover:text-ink-1 rounded-tau-sm absolute right-1 top-1/2 flex -translate-y-1/2 cursor-pointer items-center gap-1 px-1.5 py-1 transition-colors"
            role="button"
            aria-label="添加图片"
            onClick={() => setUploadPopoverVisible(v => !v)}
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        <AnimatePresence>
          {previewVisible && (
            <PortalToBody>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-50 flex items-center justify-center"
                onClick={() => setPreviewVisible(false)}
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="bg-overlay absolute inset-0"
                />

                <div
                  className="relative flex max-h-[90vh] max-w-[90vw] items-center justify-center"
                  onClick={e => e.stopPropagation()}
                >
                  {imageList.length > 1 && (
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className="bg-ink-1/60 text-ink-inverse hover:bg-ink-1/80 absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 transition-colors"
                      onClick={handlePrevImage}
                    >
                      <ChevronLeft className="h-6 w-6" strokeWidth={1.75} />
                    </motion.button>
                  )}

                  {imageList.length > 1 && (
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className="bg-ink-1/60 text-ink-inverse hover:bg-ink-1/80 absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 transition-colors"
                      onClick={handleNextImage}
                    >
                      <ChevronRight className="h-6 w-6" strokeWidth={1.75} />
                    </motion.button>
                  )}

                  <div className="max-h-3xl relative flex h-[80vh] w-[80vw] max-w-4xl items-center justify-center overflow-hidden">
                    <AnimatePresence mode="wait" custom={slideDirection}>
                      {imageList.length > 0 && imageList[previewIndex] && (
                        <motion.div
                          key={imageList[previewIndex].id}
                          custom={slideDirection}
                          initial={{
                            transform: `translateX(${slideDirection === "right" ? "100%" : "-100%"})`,
                            opacity: 0,
                          }}
                          animate={{
                            transform: "translateX(0%)",
                            opacity: 1,
                          }}
                          exit={{
                            transform: `translateX(${slideDirection === "right" ? "-100%" : "100%"})`,
                            opacity: 0.5,
                          }}
                          transition={{
                            duration: 0.3,
                            ease: "easeInOut",
                          }}
                          className="absolute inset-0 flex items-center justify-center"
                        >
                          <LocalImage
                            url={imageList[previewIndex].url}
                            alt={imageList[previewIndex].alt || "图片"}
                            className="h-full w-full cursor-zoom-out rounded-lg object-contain shadow-2xl"
                            onClick={() => setPreviewVisible(false)}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {imageList.length > 1 && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-ink-1/60 text-ink-inverse text-tau-sm absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 tabular-nums"
                    >
                      {previewIndex + 1} / {imageList.length}
                    </motion.div>
                  )}
                </div>
              </motion.div>
            </PortalToBody>
          )}
        </AnimatePresence>
      </div>
    );
  }
);

export default ImageRenderer;
