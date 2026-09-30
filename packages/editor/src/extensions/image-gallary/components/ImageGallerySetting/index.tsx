import React, { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { produce } from "immer";
import { Image as ImageIcon, Images, Link, Plus, Upload } from "lucide-react";
import { v4 as getUuid } from "uuid";
import { Button, FormField, Input, Menu, NumberInput, Select, Spinner, Switch, cn } from "@tau/ui";

import {
  ImageGalleryItem,
  LastRowMode,
  ObjectFitMode,
  ImageBorderRadiusPreset,
  ImageShadowPreset,
} from "../../../../types";
import { EGalleryMode } from "../../../../constants";
import ImageItem from "./ImageItem";
import useUploadResource from "../../../../hooks/useUploadResource";
import { useOptionalService, IMediaSelectors } from "../../../../services";
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

interface IRangeNumberInputProps {
  id?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

// 输入过程中只上报区间内的值，失焦时钳回 [min, max]；清空或越界都回落到合法整数
const RangeNumberInput = ({ id, value, min, max, onChange }: IRangeNumberInputProps) => {
  // 钳位结果与当前值相同时值不变、草稿不会自动同步，换 key 重建以回显合法值
  const [draftKey, setDraftKey] = useState(0);

  const settle = (raw: string) => {
    const parsed = Number(raw);
    const next =
      raw.trim() === "" || Number.isNaN(parsed)
        ? value
        : Math.round(Math.min(max, Math.max(min, parsed)));
    if (next !== value) onChange(next);
    else if (String(next) !== raw.trim()) setDraftKey(key => key + 1);
  };

  return (
    <NumberInput
      key={draftKey}
      id={id}
      value={value}
      inputMode="numeric"
      onValueChange={next => {
        if (next !== null && next >= min && next <= max) onChange(next);
      }}
      onBlur={e => settle(e.currentTarget.value)}
    />
  );
};

const SectionTitle = ({ children, extra }: { children: ReactNode; extra?: ReactNode }) => (
  <div className="flex items-center gap-3">
    <h3 className="text-ink-3 text-tau-meta font-medium">{children}</h3>
    <span className="bg-line-1 h-px flex-1" />
    {extra}
  </div>
);

const timeoutPromise = (ms: number): Promise<never> =>
  new Promise((_resolve, reject) => setTimeout(reject, ms));

const ImageGallerySetting = (props: IImageGallerySettingProps) => {
  const { setting, onSettingChange } = props;
  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
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

  const closeLinkInput = () => {
    setLinkUrl("");
    setShowLinkInput(false);
  };

  const handleAddLink = () => {
    if (linkUrl.trim()) {
      onAddImage([{ id: getUuid(), url: linkUrl.trim() }]);
      closeLinkInput();
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

  const columnCountOptions = [2, 3, 4, 5].map(count => ({ value: count, label: `${count} 列` }));

  return (
    <div className="flex flex-col gap-6">
      <FormField label="显示模式">
        {field => (
          <Select
            id={field.id}
            value={setting.mode}
            options={modeOptions}
            onValueChange={onModeChange}
          />
        )}
      </FormField>

      <section className="flex flex-col gap-4">
        <SectionTitle>基础设置</SectionTitle>

        <div className="grid grid-cols-2 gap-4">
          {setting.mode === EGalleryMode.Horizontal && (
            <>
              <FormField label="图片高度">
                {field => (
                  <RangeNumberInput
                    id={field.id}
                    value={setting.height || 200}
                    onChange={onHeightChange}
                    min={100}
                    max={400}
                  />
                )}
              </FormField>
              <FormField label="图片间距">
                {field => (
                  <RangeNumberInput
                    id={field.id}
                    value={setting.margins ?? 8}
                    onChange={onMarginsChange}
                    min={0}
                    max={32}
                  />
                )}
              </FormField>
              <div className="col-span-2">
                <FormField label="最后一行">
                  {field => (
                    <Select
                      id={field.id}
                      value={setting.lastRow || "nojustify"}
                      options={lastRowOptions}
                      onValueChange={onLastRowChange}
                    />
                  )}
                </FormField>
              </div>
            </>
          )}

          {setting.mode === EGalleryMode.Vertical && (
            <FormField label="列数">
              {field => (
                <Select
                  id={field.id}
                  value={setting.columnCount || 3}
                  options={columnCountOptions}
                  onValueChange={onColumnCountChange}
                />
              )}
            </FormField>
          )}

          {setting.mode === EGalleryMode.Inline && (
            <div className="col-span-2">
              <FormField label="图片对齐方式">
                {field => (
                  <Select
                    id={field.id}
                    value={setting.objectFit || "contain"}
                    options={objectFitOptions}
                    onValueChange={onObjectFitChange}
                  />
                )}
              </FormField>
            </div>
          )}
        </div>

        <Switch label="更宽显示" checked={setting.wider || false} onCheckedChange={onWiderChange} />
      </section>

      <section className="flex flex-col gap-4">
        <SectionTitle>外观设置</SectionTitle>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="圆角">
            {field => (
              <Select
                id={field.id}
                value={setting.borderRadius || "none"}
                options={IMAGE_BORDER_RADIUS_OPTIONS}
                onValueChange={onBorderRadiusChange}
              />
            )}
          </FormField>
          <FormField label="阴影">
            {field => (
              <Select
                id={field.id}
                value={normalizeImageShadowPreset(setting.shadow)}
                options={IMAGE_SHADOW_OPTIONS}
                onValueChange={onShadowChange}
              />
            )}
          </FormField>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <SectionTitle
          extra={<span className="text-ink-3 text-tau-meta">{setting.images.length} 张图片</span>}
        >
          图片管理
        </SectionTitle>

        {uploading && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-accent-soft rounded-tau-md flex items-center gap-3 px-4 py-3"
          >
            <Spinner className="size-5" />
            <div className="flex-1">
              <div className="text-accent-text text-tau-body font-medium">上传中…</div>
              <div className="text-ink-2 text-tau-meta">
                成功 {successCount} / 失败 {errorCount} / 总计 {totalCount}
              </div>
            </div>
          </motion.div>
        )}

        {showLinkInput && (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              type="url"
              lead={Link}
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              placeholder="输入图片 URL"
              onKeyDown={e => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddLink();
                } else if (e.key === "Escape") {
                  // 阻止默认后 Dialog 不再消费这次 Esc，只收起输入行
                  e.preventDefault();
                  closeLinkInput();
                }
              }}
            />
            <Button variant="primary" disabled={!linkUrl.trim()} onClick={handleAddLink}>
              添加
            </Button>
            <Button variant="ghost" onClick={closeLinkInput}>
              取消
            </Button>
          </div>
        )}

        <div className="grid grid-cols-4 gap-3">
          <input
            ref={uploadRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={handleUploadFileChange}
          />
          <Menu
            trigger={
              <button
                type="button"
                disabled={uploading}
                className={cn(
                  "border-line-2 bg-sunken text-ink-3 rounded-tau-md group flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed outline-none",
                  "ease-tau-out transition-colors duration-200 focus-visible:shadow-[var(--tau-focus-ring)]",
                  "enabled:hover:border-accent enabled:hover:bg-accent-soft enabled:hover:text-accent-text",
                  "aria-expanded:border-accent aria-expanded:bg-accent-soft aria-expanded:text-accent-text",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              >
                <span className="bg-surface grid size-10 place-items-center rounded-full">
                  <Plus className="size-5" />
                </span>
                <span className="text-tau-meta">添加图片</span>
              </button>
            }
          >
            <Menu.Item icon={<Upload />} onSelect={() => uploadRef.current?.click()}>
              上传图片
            </Menu.Item>
            <Menu.Item icon={<Link />} onSelect={() => setShowLinkInput(true)}>
              输入链接
            </Menu.Item>
            {imageSelectors.map(selector => (
              <Menu.Item
                key={selector.id}
                icon={<Images />}
                onSelect={() => handleSelectFromSource(selector.id)}
              >
                {selector.label}
              </Menu.Item>
            ))}
          </Menu>

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

        {setting.images.length === 0 && !uploading && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="bg-sunken text-ink-3 mb-4 grid size-16 place-items-center rounded-full">
              <ImageIcon className="size-8" strokeWidth={1.5} />
            </div>
            <p className="text-ink-2 text-tau-body">还没有添加图片</p>
            <p className="text-ink-3 text-tau-meta mt-1">
              点击「添加图片」，或直接粘贴剪贴板里的图片
            </p>
          </div>
        )}
      </section>
    </div>
  );
};

export default ImageGallerySetting;
