import React, { memo, useState, useRef, useEffect } from "react";
import { Popover } from "antd";
import { MdAdd, MdClose, MdChevronLeft, MdChevronRight } from "react-icons/md";
import { motion, AnimatePresence } from "framer-motion";
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
  ({ value, readonly, theme, onCellValueChange }) => {
    const imageList = Array.isArray(value) ? value : [];
    const isDark = theme === "dark";
    const [previewVisible, setPreviewVisible] = useState(false);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [uploadPopoverVisible, setUploadPopoverVisible] = useState(false);
    const [hoveredImageId, setHoveredImageId] = useState<string | null>(null);
    const [slideDirection, setSlideDirection] = useState<"left" | "right">(
      "right",
    );
    const fileInputRef = useRef<HTMLInputElement>(null);
    const uploadResource = useUploadResource();

    const handleImageClick = useMemoizedFn((index: number) => {
      setPreviewIndex(index);
      setPreviewVisible(true);
    });

    const handlePrevImage = useMemoizedFn(() => {
      setSlideDirection("left");
      setPreviewIndex((prev) => (prev === 0 ? imageList.length - 1 : prev - 1));
    });

    const handleNextImage = useMemoizedFn(() => {
      setSlideDirection("right");
      setPreviewIndex((prev) => (prev === imageList.length - 1 ? 0 : prev + 1));
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

    const handleDeleteImage = useMemoizedFn(
      (imageId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newValue = imageList.filter((item) => item.id !== imageId);
        onCellValueChange?.(newValue);
      },
    );

    const handleUploadImage = useMemoizedFn(() => {
      fileInputRef.current?.click();
      setUploadPopoverVisible(false);
    });

    const handleFileChange = useMemoizedFn(
      async (e: React.ChangeEvent<HTMLInputElement>) => {
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
          onCellValueChange?.([...imageList, ...newImages]);
        }

        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      },
    );

    const handleAddLink = useMemoizedFn((link: string) => {
      const newImage: ImageItem = {
        id: uuid(),
        url: link,
        alt: "网络图片",
      };

      onCellValueChange?.([...imageList, newImage]);
      setUploadPopoverVisible(false);
    });

    const uploadContent = (
      <ImageUpload
        onUploadLocal={handleUploadImage}
        onAddLink={handleAddLink}
      />
    );

    return (
      <div className="relative flex items-center gap-2 px-2 py-1 h-full w-full">
        <div className="flex items-center flex-nowrap gap-2 flex-1">
          {imageList.map((image, index) => (
            <motion.div
              key={image.id}
              className="relative group cursor-pointer flex-none"
              onMouseEnter={() => setHoveredImageId(image.id)}
              onMouseLeave={() => setHoveredImageId(null)}
              onClick={() => handleImageClick(index)}
            >
              <LocalImage
                url={image.url}
                alt={image.alt || "图片"}
                className="w-8 h-8 object-cover rounded border border-gray-400/50 transition-shadow hover:shadow-md"
              />

              <AnimatePresence>
                {!readonly && hoveredImageId === image.id && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-gray-400/50 rounded-full flex items-center justify-center cursor-pointer shadow-lg"
                    onClick={(e) => handleDeleteImage(image.id, e)}
                  >
                    <MdClose className="w-2 h-2 text-white" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>

        {!readonly && (
          <Popover
            content={uploadContent}
            trigger="click"
            placement="bottomRight"
            open={uploadPopoverVisible}
            onOpenChange={setUploadPopoverVisible}
          >
            <div
              className={
                "absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 px-1.5 py-1  rounded-md cursor-pointer transition-colors" +
                (isDark
                  ? " bg-gray-700/80 text-gray-200 hover:bg-gray-600/80"
                  : " bg-gray-200/80 text-gray-700 hover:bg-gray-300/80")
              }
              role="button"
              aria-label="添加图片"
            >
              <MdAdd className="w-4 h-4" />
            </div>
          </Popover>
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
                className="fixed inset-0 flex items-center justify-center z-50"
                onClick={() => setPreviewVisible(false)}
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/60"
                />

                <div
                  className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  {imageList.length > 1 && (
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                      onClick={handlePrevImage}
                    >
                      <MdChevronLeft className="w-6 h-6" />
                    </motion.button>
                  )}

                  {imageList.length > 1 && (
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                      onClick={handleNextImage}
                    >
                      <MdChevronRight className="w-6 h-6" />
                    </motion.button>
                  )}

                  <div className="relative overflow-hidden w-[80vw] h-[80vh] max-w-4xl max-h-3xl flex items-center justify-center">
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
                            className="w-full h-full object-contain rounded-lg shadow-2xl cursor-zoom-out"
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
                      className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/50 text-white text-sm"
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
  },
);

export default ImageRenderer;
