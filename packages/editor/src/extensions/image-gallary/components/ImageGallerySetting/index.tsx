import React, { useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { produce } from "immer";
import {
  MdAdd,
  MdLink,
  MdUploadFile,
  MdImage,
  MdClose,
  MdPhotoLibrary,
} from "react-icons/md";
import { v4 as getUuid } from "uuid";
import { useSlateStatic } from "slate-react";
import { SelectDropDown } from "@tau/shared";

import {
  ImageGalleryItem,
  LastRowMode,
  ObjectFitMode,
  IResource,
} from "../../../../types";
import { EGalleryMode } from "../../../../constants";
import ImageItem from "./ImageItem";
import useUploadResource from "../../../../hooks/useUploadResource";

export interface ISetting {
  mode: EGalleryMode;
  wider?: boolean;
  height?: number;
  columnCount?: number;
  margins?: number;
  lastRow?: LastRowMode;
  objectFit?: ObjectFitMode;
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
  <label className="flex items-center gap-3 cursor-pointer group">
    <div className="relative">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <div
        className={`
          w-11 h-6 rounded-full transition-all duration-200 ease-in-out
          ${checked ? "bg-indigo-500" : "bg-gray-200 dark:bg-slate-700"}
          group-hover:shadow-md
        `}
      >
        <div
          className={`
            absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md
            transition-transform duration-200 ease-in-out
            ${checked ? "translate-x-5" : "translate-x-0"}
          `}
        />
      </div>
    </div>
    <span className="text-sm text-gray-700 dark:text-slate-300 select-none">
      {label}
    </span>
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
  const selectedOption = options.find((o) => o.value === value);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
        {label}
      </label>
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="
            w-full px-4 py-3 rounded-xl text-sm text-left
            bg-gray-50 dark:bg-slate-950
            border border-gray-200 dark:border-slate-700
            text-gray-800 dark:text-white
            hover:border-gray-300 dark:hover:border-slate-600
            focus:border-indigo-500 focus:outline-none
            transition-colors
            flex items-center justify-between
          "
        >
          <span>{selectedOption?.label || "请选择"}</span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
        <SelectDropDown
          items={options}
          selectedKey={value}
          show={isOpen}
          onClose={() => setIsOpen(false)}
          onSelect={(item) => onChange(item.value)}
          triggerElement={triggerRef.current}
          getKey={(item) => item.value}
          renderItem={(item) => item.label}
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
      <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
        {label}
      </label>
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => handleChange(value - 1)}
          disabled={min !== undefined && value <= min}
          className="
            w-10 h-10 rounded-l-xl
            bg-gray-100 dark:bg-slate-800
            border border-r-0 border-gray-200 dark:border-slate-700
            text-gray-600 dark:text-slate-400
            hover:bg-gray-200 dark:hover:bg-slate-700
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors
            flex items-center justify-center
          "
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20 12H4"
            />
          </svg>
        </button>
        <input
          type="number"
          value={value}
          onChange={(e) => handleChange(Number(e.target.value))}
          min={min}
          max={max}
          className="
            w-16 h-10 text-center text-sm
            bg-gray-50 dark:bg-slate-950
            border-y border-gray-200 dark:border-slate-700
            text-gray-800 dark:text-white
            focus:outline-none
            [appearance:textfield]
            [&::-webkit-outer-spin-button]:appearance-none
            [&::-webkit-inner-spin-button]:appearance-none
          "
        />
        <button
          type="button"
          onClick={() => handleChange(value + 1)}
          disabled={max !== undefined && value >= max}
          className="
            w-10 h-10 rounded-r-xl
            bg-gray-100 dark:bg-slate-800
            border border-l-0 border-gray-200 dark:border-slate-700
            text-gray-600 dark:text-slate-400
            hover:bg-gray-200 dark:hover:bg-slate-700
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors
            flex items-center justify-center
          "
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
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
  const [resourcePickerOpen, setResourcePickerOpen] = useState(false);

  const editor = useSlateStatic();
  const ResourcePickerModal = editor.services?.components?.ResourcePickerModal;
  const uploadResource = useUploadResource();

  const onHeightChange = (value: number) => {
    onSettingChange(
      produce(setting, (draft) => {
        draft.height = value;
      }),
    );
  };

  const onModeChange = (value: EGalleryMode) => {
    onSettingChange(
      produce(setting, (draft) => {
        draft.mode = value;
      }),
    );
  };

  const onWiderChange = (value: boolean) => {
    onSettingChange(
      produce(setting, (draft) => {
        draft.wider = value;
      }),
    );
  };

  const onColumnCountChange = (value: number) => {
    onSettingChange(
      produce(setting, (draft) => {
        draft.columnCount = value;
      }),
    );
  };

  const onMarginsChange = (value: number) => {
    onSettingChange(
      produce(setting, (draft) => {
        draft.margins = value;
      }),
    );
  };

  const onLastRowChange = (value: LastRowMode) => {
    onSettingChange(
      produce(setting, (draft) => {
        draft.lastRow = value;
      }),
    );
  };

  const onObjectFitChange = (value: ObjectFitMode) => {
    onSettingChange(
      produce(setting, (draft) => {
        draft.objectFit = value;
      }),
    );
  };

  const onAddImage = (values: ImageGalleryItem[]) => {
    onSettingChange(
      produce(setting, (draft) => {
        draft.images = draft.images.concat(values);
      }),
    );
  };

  const onDropImage = (
    dragImageItem: ImageGalleryItem,
    dropImageItem: ImageGalleryItem,
  ) => {
    onSettingChange(
      produce(setting, (draft) => {
        const dragIndex = draft.images.findIndex(
          (item) => item.id === dragImageItem.id,
        );
        const dropIndex = draft.images.findIndex(
          (item) => item.id === dropImageItem.id,
        );
        if (dragIndex === -1 || dropIndex === -1) {
          return;
        }
        draft.images.splice(dragIndex, 1);
        draft.images.splice(dropIndex, 0, dragImageItem);
      }),
    );
  };

  const uploadFile = async (file: File) => {
    if (!uploadResource) {
      return null;
    }
    try {
      const result = await Promise.race([
        uploadResource(file),
        timeoutPromise(10000),
      ]);
      if (!result) return null;
      return typeof result === "string"
        ? result
        : ((result as { url?: string }).url ?? null);
    } catch (e) {
      return null;
    }
  };

  const handleUploadFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files) {
      return;
    }
    setShowUploadOptions(false);
    setUploading(true);
    setTotalCount(files.length);
    setSuccessCount(0);
    setErrorCount(0);

    const promises: Promise<string | null>[] = [];
    for (const file of files) {
      promises.push(uploadFile(file));
    }
    const successUrls: string[] = [];
    for (const promise of promises) {
      promise
        .then((url) => {
          if (url) {
            successUrls.push(url);
            setSuccessCount((successCount) => {
              return successCount + 1;
            });
          } else {
            setErrorCount((errorCount) => {
              return errorCount + 1;
            });
          }
        })
        .catch(() => {
          setErrorCount((errorCount) => {
            return errorCount + 1;
          });
        })
        .finally(() => {
          if (successCount + errorCount === totalCount) {
            onAddImage(
              successUrls.map((url) => ({
                id: getUuid(),
                url,
              })),
            );
            setUploading(false);
          }
          event.target.value = "";
        });
    }
  };

  const handleAddLink = () => {
    if (linkUrl.trim()) {
      onAddImage([{ id: getUuid(), url: linkUrl.trim() }]);
      setLinkUrl("");
      setShowLinkInput(false);
    }
  };

  const handleInsertFromResource = (selected: IResource[]) => {
    if (!selected.length) {
      setResourcePickerOpen(false);
      return;
    }
    const newImages: ImageGalleryItem[] = selected
      .map((resource) => {
        const resourceUrl = resource.path || resource.url;
        if (!resourceUrl) return null;
        return { id: getUuid(), url: resourceUrl };
      })
      .filter((item): item is ImageGalleryItem => item !== null);

    if (newImages.length > 0) {
      onAddImage(newImages);
    }
    setResourcePickerOpen(false);
  };

  const onDeleteImage = (item: ImageGalleryItem) => {
    onSettingChange(
      produce(setting, (draft) => {
        draft.images = draft.images.filter((i) => i.id !== item.id);
      }),
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
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 flex items-center gap-2">
          <span className="w-4 h-px bg-gray-200 dark:bg-slate-700" />
          基础设置
          <span className="flex-1 h-px bg-gray-200 dark:bg-slate-700" />
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

        <ToggleSwitch
          checked={setting.wider || false}
          onChange={onWiderChange}
          label="更宽显示"
        />
      </div>

      {/* Section: Images */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 flex items-center gap-2">
            <span className="w-4 h-px bg-gray-200 dark:bg-slate-700" />
            图片管理
            <span className="flex-1 h-px bg-gray-200 dark:bg-slate-700" />
          </h3>
          <span className="text-xs text-gray-400 dark:text-slate-500">
            {setting.images.length} 张图片
          </span>
        </div>

        {/* Upload Progress */}
        {uploading && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20"
          >
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
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
              className="
                w-full aspect-square rounded-xl
                border-2 border-dashed border-gray-300 dark:border-slate-600
                bg-gray-50 dark:bg-slate-900
                hover:border-indigo-400 dark:hover:border-indigo-500
                hover:bg-indigo-50 dark:hover:bg-indigo-500/10
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-200
                flex flex-col items-center justify-center gap-2
                group
              "
            >
              <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-slate-700 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-500/20 flex items-center justify-center transition-colors">
                <MdAdd className="w-6 h-6 text-gray-400 dark:text-slate-500 group-hover:text-indigo-500" />
              </div>
              <span className="text-xs text-gray-400 dark:text-slate-500 group-hover:text-indigo-500">
                添加图片
              </span>
            </button>

            {/* Upload Options Dropdown */}
            <AnimatePresence>
              {showUploadOptions && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowUploadOptions(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="
                      absolute z-20 left-0 right-0 mt-2
                      bg-white dark:bg-slate-900
                      border border-gray-200 dark:border-slate-700
                      rounded-xl shadow-xl overflow-hidden
                    "
                  >
                    <button
                      type="button"
                      onClick={() => {
                        uploadRef.current?.click();
                        setShowUploadOptions(false);
                      }}
                      className="
                        w-full px-4 py-3 text-left text-sm
                        text-gray-700 dark:text-slate-300
                        hover:bg-gray-50 dark:hover:bg-slate-800
                        flex items-center gap-3
                        transition-colors
                      "
                    >
                      <MdUploadFile className="w-5 h-5 text-gray-400" />
                      <span>上传图片</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowLinkInput(true);
                        setShowUploadOptions(false);
                      }}
                      className="
                        w-full px-4 py-3 text-left text-sm
                        text-gray-700 dark:text-slate-300
                        hover:bg-gray-50 dark:hover:bg-slate-800
                        flex items-center gap-3
                        transition-colors
                      "
                    >
                      <MdLink className="w-5 h-5 text-gray-400" />
                      <span>输入链接</span>
                    </button>
                    {ResourcePickerModal && (
                      <button
                        type="button"
                        onClick={() => {
                          setResourcePickerOpen(true);
                          setShowUploadOptions(false);
                        }}
                        className="
                          w-full px-4 py-3 text-left text-sm
                          text-gray-700 dark:text-slate-300
                          hover:bg-gray-50 dark:hover:bg-slate-800
                          flex items-center gap-3
                          transition-colors
                        "
                      >
                        <MdPhotoLibrary className="w-5 h-5 text-gray-400" />
                        <span>从资源库选择</span>
                      </button>
                    )}
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
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center mb-4">
              <MdImage className="w-8 h-8 text-gray-300 dark:text-slate-600" />
            </div>
            <p className="text-sm text-gray-400 dark:text-slate-500">
              还没有添加图片
            </p>
            <p className="text-xs text-gray-300 dark:text-slate-600 mt-1">
              点击上方按钮添加图片
            </p>
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
              className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl border border-gray-200 dark:border-slate-800"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-gray-800 dark:text-white">
                  添加图片链接
                </h3>
                <button
                  onClick={() => setShowLinkInput(false)}
                  className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
                >
                  <MdClose className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="输入图片 URL"
                autoFocus
                className="
                  w-full px-4 py-3.5 rounded-xl text-sm
                  bg-gray-50 dark:bg-slate-950
                  border border-gray-200 dark:border-slate-700
                  text-gray-800 dark:text-white
                  placeholder:text-gray-400 dark:placeholder:text-slate-500
                  focus:border-indigo-500 focus:outline-none
                  transition-colors
                "
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleAddLink();
                  }
                }}
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setShowLinkInput(false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleAddLink}
                  disabled={!linkUrl.trim()}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  添加
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Resource Picker Modal */}
      {ResourcePickerModal && (
        <ResourcePickerModal
          open={resourcePickerOpen}
          onCancel={() => setResourcePickerOpen(false)}
          allowedTypes={["image"]}
          multiple
          title="选择图片"
          onConfirm={handleInsertFromResource}
        />
      )}
    </div>
  );
};

export default ImageGallerySetting;
