import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { produce } from "immer";
import { MdAdd, MdLink, MdUploadFile, MdImage, MdClose, MdPhotoLibrary } from "react-icons/md";
import { v4 as getUuid } from "uuid";
import { SelectDropDown } from "@tau/shared";

import {
  ImageGalleryItem,
  LastRowMode,
  ObjectFitMode,
  ImageBorderRadiusPreset,
  ImageShadowPreset,
} from "../../../../types/index";
import { EGalleryMode } from "../../../../types/index";
import ImageItem from "./ImageItem/index";
import useUploadResource from "../../../../hooks/useUploadResource";
import { useOptionalService } from "@tau/editor/api";
import { IMediaSelectors } from "../../../../services/tokens";
import {
  IMAGE_BORDER_RADIUS_OPTIONS,
  IMAGE_SHADOW_OPTIONS,
  normalizeImageShadowPreset,
} from "../../../image/utils/appearance";

export interface ISetting {
  mode: EGalleryMode;
  wider?: boolean;
  height?: number;
  columnCount?: number;
  margins?: number;
  lastRow?: LastRowMode;
  objectFit?: ObjectFitMode;
  borderRadius?: ImageBorderRadiusPreset;
  shadow?: ImageShadowPreset | boolean;
  images: ImageGalleryItem[];
}

interface IImageGallerySettingProps {
  setting: ISetting;
  onSettingChange: (setting: ISetting) => void;
}

// Custom Toggle Switch Component
const ToggleSwitch = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) => (
  <label className="group flex cursor-pointer items-center gap-3">
    <div className="relative">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <div
        className={`h-6 w-11 rounded-full transition-all duration-200 ease-in-out ${checked ? "bg-indigo-500" : "bg-[var(--ed-bg-hover)]"} group-hover:shadow-md`}
      >
        <div
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out ${checked ? "translate-x-5" : "translate-x-0"} `}
        />
      </div>
    </div>
    <span className="select-none text-sm text-[var(--ed-text)]">{label}</span>
  </label>
);

// Custom Select Component using SelectDropDown
const CustomSelect = <T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedOption = options.find(o => o.value === value);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ed-text-secondary)]">
        {label}
      </label>
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm text-gray-800 transition-colors hover:border-gray-300 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:hover:border-slate-600"
        >
          <span>{selectedOption?.label || "请选择"}</span>
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <SelectDropDown
          items={options}
          selectedKey={value}
          show={isOpen}
          onClose={() => setIsOpen(false)}
          onSelect={item => onChange(item.value)}
          triggerElement={triggerRef.current}
          getKey={item => item.value}
          renderItem={item => item.label}
          width={triggerRef.current?.offsetWidth}
        />
      </div>
    </div>
  );
};

// Custom Number Input Component
const NumberInput = ({
  value,
  onChange,
  min,
  max,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label: string;
}) => {
  const handleChange = (newValue: number) => {
    if (min !== undefined && newValue < min) newValue = min;
    if (max !== undefined && newValue > max) newValue = max;
    onChange(newValue);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ed-text-secondary)]">
        {label}
      </label>
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => handleChange(value - 1)}
          disabled={min !== undefined && value <= min}
          className="flex h-10 w-10 items-center justify-center rounded-l-xl border border-r-0 border-gray-200 bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-zinc-800 dark:text-slate-400 dark:hover:bg-zinc-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <input
          type="number"
          value={value}
          onChange={e => handleChange(Number(e.target.value))}
          min={min}
          max={max}
          className="h-10 w-16 border-y border-gray-200 bg-gray-50 text-center text-sm text-gray-800 [appearance:textfield] focus:outline-none dark:border-slate-700 dark:bg-zinc-950 dark:text-white [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => handleChange(value + 1)}
          disabled={max !== undefined && value >= max}
          className="flex h-10 w-10 items-center justify-center rounded-r-xl border border-l-0 border-gray-200 bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-zinc-800 dark:text-slate-400 dark:hover:bg-zinc-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </div>
  );
};

const timeoutPromise = (ms: number): Promise<never> =>
  new Promise((_resolve, reject) => setTimeout(reject, ms));

const ImageGallerySetting = (props: IImageGallerySettingProps) => {
  const { setting, onSettingChange } = props;
  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showUploadOptions, setShowUploadOptions] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  // 宿主注册的图片选择入口；未注册则不显示对应按钮
  const imageSelectors = (useOptionalService(IMediaSelectors) ?? []).filter(
    selector => selector.mediaTypes.includes("image") && (selector.isAvailable?.() ?? true)
  );
  const uploadResource = useUploadResource();

  const onHeightChange = (value: number) => {
    onSettingChange(
      produce(setting, draft => {
        draft.height = value;
      })
    );
  };

  const onModeChange = (value: EGalleryMode) => {
    onSettingChange(
      produce(setting, draft => {
        draft.mode = value;
      })
    );
  };

  const onWiderChange = (value: boolean) => {
    onSettingChange(
      produce(setting, draft => {
        draft.wider = value;
      })
    );
  };

  const onColumnCountChange = (value: number) => {
    onSettingChange(
      produce(setting, draft => {
        draft.columnCount = value;
      })
    );
  };

  const onMarginsChange = (value: number) => {
    onSettingChange(
      produce(setting, draft => {
        draft.margins = value;
      })
    );
  };

  const onLastRowChange = (value: LastRowMode) => {
    onSettingChange(
      produce(setting, draft => {
        draft.lastRow = value;
      })
    );
  };

  const onObjectFitChange = (value: ObjectFitMode) => {
    onSettingChange(
      produce(setting, draft => {
        draft.objectFit = value;
      })
    );
  };

  const onBorderRadiusChange = (value: ImageBorderRadiusPreset) => {
    onSettingChange(
      produce(setting, draft => {
        draft.borderRadius = value;
      })
    );
  };

  const onShadowChange = (value: ImageShadowPreset) => {
    onSettingChange(
      produce(setting, draft => {
        draft.shadow = value;
      })
    );
  };

  const onAddImage = useCallback(
    (values: ImageGalleryItem[]) => {
      onSettingChange(
        produce(setting, draft => {
          draft.images = draft.images.concat(values);
        })
      );
    },
    [setting, onSettingChange]
  );

  const onDropImage = (dragImageItem: ImageGalleryItem, dropImageItem: ImageGalleryItem) => {
    onSettingChange(
      produce(setting, draft => {
        const dragIndex = draft.images.findIndex(item => item.id === dragImageItem.id);
        const dropIndex = draft.images.findIndex(item => item.id === dropImageItem.id);
        if (dragIndex === -1 || dropIndex === -1) {
          return;
        }
        draft.images.splice(dragIndex, 1);
        draft.images.splice(dropIndex, 0, dragImageItem);
      })
    );
  };

  const uploadFile = useCallback(
    async (file: File) => {
      if (!uploadResource) {
        return null;
      }
      try {
        const result = await Promise.race([uploadResource(file), timeoutPromise(10000)]);
        if (!result) return null;
        return typeof result === "string" ? result : ((result as { url?: string }).url ?? null);
      } catch (e) {
        return null;
      }
    },
    [uploadResource]
  );

  const handleUploadFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!files.length) return;
      setShowUploadOptions(false);
      setUploading(true);
      setTotalCount(files.length);
      setSuccessCount(0);
      setErrorCount(0);

      const promises: Promise<string | null>[] = [];
      for (const file of Array.from(files)) {
        promises.push(uploadFile(file));
      }
      const successUrls: string[] = [];
      let doneCount = 0;
      for (const promise of promises) {
        promise
          .then(url => {
            if (url) {
              successUrls.push(url);
              setSuccessCount(c => c + 1);
            } else {
              setErrorCount(c => c + 1);
            }
          })
          .catch(() => {
            setErrorCount(c => c + 1);
          })
          .finally(() => {
            doneCount++;
            if (doneCount === files.length) {
              onAddImage(
                successUrls.map(url => ({
                  id: getUuid(),
                  url,
                }))
              );
              setUploading(false);
            }
          });
      }
    },
    [uploadFile, onAddImage]
  );

  const handleUploadFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    await handleUploadFiles(files);
    event.target.value = "";
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        handleUploadFiles(imageFiles);
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handleUploadFiles]);

  const handleAddLink = () => {
    if (linkUrl.trim()) {
      onAddImage([{ id: getUuid(), url: linkUrl.trim() }]);
      setLinkUrl("");
      setShowLinkInput(false);
    }
  };

  const handleSelectFromSource = (selectorId: string) => {
    const selector = imageSelectors.find(s => s.id === selectorId);
    if (!selector) return;
    selector.select({
      mediaType: "image",
      multiple: true,
      onSelected: items => {
        const newImages = items
          .filter(item => item.url)
          .map(item => ({ id: getUuid(), url: item.url }));
        if (newImages.length > 0) {
          onAddImage(newImages);
        }
      },
    });
  };

  const onDeleteImage = (item: ImageGalleryItem) => {
    onSettingChange(
      produce(setting, draft => {
        draft.images = draft.images.filter(i => i.id !== item.id);
      })
    );
  };

  const modeOptions = [
    { value: EGalleryMode.Horizontal, label: "横向 (Justified)" },
    { value: EGalleryMode.Vertical, label: "纵向 (瀑布流)" },
    { value: EGalleryMode.Inline, label: "轮播" },
  ];

  const lastRowOptions: { value: LastRowMode; label: string }[] = [
    { value: "justify", label: "拉伸填充" },
    { value: "nojustify", label: "保持原样" },
    { value: "center", label: "居中对齐" },
    { value: "right", label: "靠右对齐" },
    { value: "hide", label: "隐藏" },
  ];

  const objectFitOptions: { value: ObjectFitMode; label: string }[] = [
    { value: "contain", label: "适应 (Contain)" },
    { value: "cover", label: "填充 (Cover)" },
  ];

  return (
    <div className="flex flex-col gap-6 p-2">
      {/* Section: Mode Selection */}
      <div>
        <CustomSelect
          value={setting.mode}
          options={modeOptions}
          onChange={onModeChange}
          label="显示模式"
        />
      </div>

      {/* Section: Basic Settings */}
      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--ed-text-tertiary)]">
          <span className="h-px w-4 bg-[var(--ed-bg-hover)]" />
          基础设置
          <span className="h-px flex-1 bg-[var(--ed-bg-hover)]" />
        </h3>

        <div className="grid grid-cols-2 gap-4">
          {/* Horizontal Mode Settings */}
          {setting.mode === EGalleryMode.Horizontal && (
            <>
              <NumberInput
                value={setting.height || 200}
                onChange={onHeightChange}
                min={100}
                max={400}
                label="图片高度"
              />
              <NumberInput
                value={setting.margins ?? 8}
                onChange={onMarginsChange}
                min={0}
                max={32}
                label="图片间距"
              />
              <div className="col-span-2">
                <CustomSelect
                  value={setting.lastRow || "nojustify"}
                  options={lastRowOptions}
                  onChange={onLastRowChange}
                  label="最后一行"
                />
              </div>
            </>
          )}

          {/* Vertical Mode Settings */}
          {setting.mode === EGalleryMode.Vertical && (
            <NumberInput
              value={setting.columnCount || 3}
              onChange={onColumnCountChange}
              min={2}
              max={5}
              label="列数"
            />
          )}

          {/* Inline/Carousel Mode Settings */}
          {setting.mode === EGalleryMode.Inline && (
            <div className="col-span-2">
              <CustomSelect
                value={setting.objectFit || "contain"}
                options={objectFitOptions}
                onChange={onObjectFitChange}
                label="图片对齐方式"
              />
            </div>
          )}
        </div>

        <ToggleSwitch checked={setting.wider || false} onChange={onWiderChange} label="更宽显示" />
      </div>

      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--ed-text-tertiary)]">
          <span className="h-px w-4 bg-[var(--ed-bg-hover)]" />
          外观设置
          <span className="h-px flex-1 bg-[var(--ed-bg-hover)]" />
        </h3>

        <CustomSelect
          value={setting.borderRadius || "none"}
          options={IMAGE_BORDER_RADIUS_OPTIONS}
          onChange={onBorderRadiusChange}
          label="圆角"
        />

        <CustomSelect
          value={normalizeImageShadowPreset(setting.shadow)}
          options={IMAGE_SHADOW_OPTIONS}
          onChange={onShadowChange}
          label="阴影"
        />
      </div>

      {/* Section: Images */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--ed-text-tertiary)]">
            <span className="h-px w-4 bg-[var(--ed-bg-hover)]" />
            图片管理
            <span className="h-px flex-1 bg-[var(--ed-bg-hover)]" />
          </h3>
          <span className="text-xs text-[var(--ed-text-tertiary)]">
            {setting.images.length} 张图片
          </span>
        </div>

        {/* Upload Progress */}
        {uploading && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 dark:border-indigo-500/20 dark:bg-indigo-500/10"
          >
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <div className="flex-1">
              <div className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                上传中...
              </div>
              <div className="text-xs text-indigo-500/70 dark:text-indigo-400/70">
                成功 {successCount} / 失败 {errorCount} / 总计 {totalCount}
              </div>
            </div>
          </motion.div>
        )}

        {/* Image Grid */}
        <div className="grid grid-cols-4 gap-3">
          {/* Add Image Button */}
          <div className="relative">
            <input
              ref={uploadRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={handleUploadFileChange}
            />
            <button
              type="button"
              onClick={() => setShowUploadOptions(!showUploadOptions)}
              disabled={uploading}
              className="group flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 transition-all duration-200 hover:border-indigo-400 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-zinc-900 dark:hover:border-indigo-500 dark:hover:bg-indigo-500/10"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 transition-colors group-hover:bg-indigo-100 dark:bg-zinc-700 dark:group-hover:bg-indigo-500/20">
                <MdAdd className="h-6 w-6 text-gray-400 group-hover:text-indigo-500 dark:text-slate-500" />
              </div>
              <span className="text-xs text-gray-400 group-hover:text-indigo-500 dark:text-slate-500">
                添加图片
              </span>
            </button>

            {/* Upload Options Dropdown */}
            <AnimatePresence>
              {showUploadOptions && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowUploadOptions(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-slate-700 dark:bg-zinc-900"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        uploadRef.current?.click();
                        setShowUploadOptions(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-zinc-800"
                    >
                      <MdUploadFile className="h-5 w-5 text-gray-400" />
                      <span>上传图片</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowLinkInput(true);
                        setShowUploadOptions(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-zinc-800"
                    >
                      <MdLink className="h-5 w-5 text-gray-400" />
                      <span>输入链接</span>
                    </button>
                    {imageSelectors.map(selector => (
                      <button
                        type="button"
                        key={selector.id}
                        onClick={() => {
                          handleSelectFromSource(selector.id);
                          setShowUploadOptions(false);
                        }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-zinc-800"
                      >
                        <MdPhotoLibrary className="h-5 w-5 text-gray-400" />
                        <span>{selector.label}</span>
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Image Items */}
          {setting.images.map((item, index) => (
            <ImageItem
              imageItem={item}
              index={index}
              onDelete={onDeleteImage}
              key={item.id}
              onDrop={onDropImage}
            />
          ))}
        </div>

        {/* Empty State */}
        {setting.images.length === 0 && !uploading && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--ed-bg-sunken)]">
              <MdImage className="h-8 w-8 text-gray-300 dark:text-slate-600" />
            </div>
            <p className="text-sm text-[var(--ed-text-tertiary)]">还没有添加图片</p>
            <p className="mt-1 text-xs text-gray-300 dark:text-slate-600">点击上方按钮添加图片</p>
          </div>
        )}
      </div>

      {/* Link Input Modal */}
      <AnimatePresence>
        {showLinkInput && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setShowLinkInput(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              className="mx-4 w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-zinc-900"
              onClick={e => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-800 dark:text-white">
                  添加图片链接
                </h3>
                <button
                  onClick={() => setShowLinkInput(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 transition-colors hover:bg-[var(--ed-bg-hover)] dark:hover:bg-zinc-700"
                >
                  <MdClose className="h-5 w-5 text-gray-500" />
                </button>
              </div>
              <input
                type="url"
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                placeholder="输入图片 URL"
                autoFocus
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 transition-colors placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    handleAddLink();
                  }
                }}
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowLinkInput(false)}
                  className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-[var(--ed-bg-hover)] dark:text-slate-300 dark:hover:bg-zinc-700"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleAddLink}
                  disabled={!linkUrl.trim()}
                  className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  添加
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ImageGallerySetting;
