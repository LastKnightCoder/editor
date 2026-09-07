import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Empty, Spin } from "antd";
import { useVirtualizer } from "@tanstack/react-virtual";
import classNames from "classnames";
import { useMemoizedFn, useAsyncEffect } from "ahooks";
import { X } from "lucide-react";

import CustomModal from "@/components/CustomModal";
import CustomCheckbox from "@/components/CustomCheckbox";
import LocalImage from "@/components/LocalImage";
import LocalVideo from "@/components/LocalVideo";
import LocalAudio from "@/components/LocalAudio";
import { getAllResources } from "@/commands";
import { IResource, ResourceType } from "@/types";
import TypeSelect from "./TypeSelect";
import ResourceThumbnail from "./ResourceThumbnail";

interface ResourceSyncBlacklistModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (fileNames: string[]) => Promise<void> | void;
  blacklistNames: string[];
  confirmLoading?: boolean;
}

const RESOURCE_TYPE_OPTIONS: Array<{
  label: string;
  value: ResourceType | "all";
}> = [
  { label: "全部类型", value: "all" },
  { label: "图片", value: "image" },
  { label: "视频", value: "video" },
  { label: "音频", value: "audio" },
  { label: "PDF", value: "pdf" },
  { label: "EPUB", value: "epub" },
  { label: "附件", value: "attachment" },
];

const ResourceSyncBlacklistModal = ({
  open,
  onClose,
  onConfirm,
  blacklistNames,
}: ResourceSyncBlacklistModalProps) => {
  const listRef = useRef<HTMLDivElement>(null);

  const [resources, setResources] = useState<IResource[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [typeFilter, setTypeFilter] = useState<ResourceType | "all">("all");
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // 预览状态
  const [imagePreview, setImagePreview] = useState<{
    open: boolean;
    src: string;
    title: string;
  }>({ open: false, src: "", title: "" });

  const [videoPreview, setVideoPreview] = useState<{
    open: boolean;
    src: string;
    title: string;
  }>({ open: false, src: "", title: "" });

  const [audioPreview, setAudioPreview] = useState<{
    open: boolean;
    src: string;
    title: string;
  }>({ open: false, src: "", title: "" });

  const blacklistSet = useMemo(() => new Set(blacklistNames || []), [blacklistNames]);

  useAsyncEffect(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const list = await getAllResources();
      setResources(list);
    } finally {
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSearchKeyword("");
      setTypeFilter("all");
      setSelectedNames(new Set());
    }
  }, [open]);

  const filteredResources = useMemo(() => {
    let result = resources;
    if (typeFilter !== "all") {
      result = result.filter(resource => resource.type === typeFilter);
    }
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.trim().toLowerCase();
      result = result.filter(
        resource =>
          resource.name.toLowerCase().includes(keyword) ||
          resource.path.toLowerCase().includes(keyword)
      );
    }
    return result;
  }, [resources, typeFilter, searchKeyword]);

  const rowVirtualizer = useVirtualizer({
    count: filteredResources.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 68,
    overscan: 5,
  });

  const toggleSelection = useMemoizedFn((resource: IResource) => {
    if (blacklistSet.has(resource.name)) {
      return;
    }

    setSelectedNames(prev => {
      const next = new Set(prev);
      if (next.has(resource.name)) {
        next.delete(resource.name);
      } else {
        next.add(resource.name);
      }
      return next;
    });
  });

  const handleConfirm = useMemoizedFn(async () => {
    if (!selectedNames.size) return;
    setConfirmLoading(true);
    try {
      await onConfirm(Array.from(selectedNames));
      setSelectedNames(new Set());
      onClose();
    } finally {
      setConfirmLoading(false);
    }
  });

  // 预览处理函数
  const openImagePreview = useCallback((src: string, title: string) => {
    setImagePreview({ open: true, src, title });
  }, []);

  const closeImagePreview = useCallback(() => {
    setImagePreview(prev => ({ ...prev, open: false }));
  }, []);

  const openVideoPreview = useCallback((src: string, title: string) => {
    setVideoPreview({ open: true, src, title });
  }, []);

  const closeVideoPreview = useCallback(() => {
    setVideoPreview(prev => ({ ...prev, open: false }));
  }, []);

  const openAudioPreview = useCallback((src: string, title: string) => {
    setAudioPreview({ open: true, src, title });
  }, []);

  const closeAudioPreview = useCallback(() => {
    setAudioPreview(prev => ({ ...prev, open: false }));
  }, []);

  return (
    <>
      <CustomModal open={open} onCancel={onClose} title="管理资源黑名单" width={720} footer={null}>
        <div className="flex flex-col gap-4">
          {/* 搜索和过滤栏 */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="搜索文件名或路径"
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              className="min-w-[200px] flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
            />
            <TypeSelect
              value={typeFilter}
              onChange={setTypeFilter}
              options={RESOURCE_TYPE_OPTIONS}
            />
          </div>

          {/* 选择信息栏 */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500 dark:text-slate-400">
              共 {filteredResources.length} 个资源
              {selectedNames.size > 0 && (
                <span className="ml-2 text-[var(--th-accent)]">· 已选 {selectedNames.size} 个</span>
              )}
            </span>
            {selectedNames.size > 0 && (
              <button
                className="text-[var(--th-accent)] transition-colors hover:text-[var(--th-active-text)]"
                onClick={() => setSelectedNames(new Set())}
              >
                清空选择
              </button>
            )}
          </div>

          {/* 列表区域 */}
          <div
            ref={listRef}
            className="h-[420px] overflow-auto rounded-xl border border-gray-200 dark:border-slate-700"
          >
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <Spin />
              </div>
            ) : filteredResources.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <Empty description="暂无资源" />
              </div>
            ) : (
              <div
                style={{
                  height: rowVirtualizer.getTotalSize(),
                  position: "relative",
                }}
              >
                {rowVirtualizer.getVirtualItems().map(virtualRow => {
                  const resource = filteredResources[virtualRow.index];
                  const isChecked = selectedNames.has(resource.name);
                  const disabled = blacklistSet.has(resource.name);

                  return (
                    <div
                      key={resource.id}
                      className={classNames(
                        "flex cursor-pointer items-center gap-3 px-4 py-3 transition-all",
                        // 选中状态
                        isChecked
                          ? "bg-[var(--th-accent-soft)]/80"
                          : "hover:bg-gray-50 dark:hover:bg-zinc-800/50",
                        // 分隔线
                        "border-b border-gray-100 last:border-b-0 dark:border-slate-800",
                        // 禁用状态
                        disabled && "opacity-50"
                      )}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start}px)`,
                        height: `${virtualRow.size}px`,
                      }}
                      onClick={() => toggleSelection(resource)}
                    >
                      {/* Checkbox */}
                      <CustomCheckbox
                        checked={isChecked || disabled}
                        onChange={() => toggleSelection(resource)}
                        readonly={disabled}
                      />

                      {/* 缩略图 */}
                      <ResourceThumbnail
                        resource={{
                          name: resource.name,
                          path: resource.path,
                          type: resource.type,
                        }}
                        onImageClick={() => openImagePreview(resource.path, resource.name)}
                        onVideoClick={() => openVideoPreview(resource.path, resource.name)}
                        onAudioClick={() => openAudioPreview(resource.path, resource.name)}
                      />

                      {/* 文件信息 */}
                      <div className="min-w-0 flex-1">
                        <div
                          className={classNames(
                            "truncate text-sm font-medium",
                            disabled
                              ? "text-gray-400 dark:text-slate-500"
                              : "text-gray-800 dark:text-white"
                          )}
                        >
                          {resource.name}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-slate-400">
                          {resource.path}
                        </div>
                      </div>

                      {/* 类型标签 */}
                      <span
                        className={classNames(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider",
                          "bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-slate-400"
                        )}
                      >
                        {resource.type}
                      </span>

                      {/* 已在黑名单标记 */}
                      {disabled && (
                        <span className="shrink-0 whitespace-nowrap text-[10px] text-red-500 dark:text-red-400">
                          已在黑名单
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 底部按钮 */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              className="rounded-xl border border-gray-200 bg-gray-100 px-5 py-3 text-sm font-medium text-gray-700 transition-all hover:bg-gray-200 dark:border-slate-700 dark:bg-zinc-800 dark:text-slate-200 dark:hover:bg-zinc-700"
              onClick={onClose}
            >
              取消
            </button>
            <button
              className="rounded-xl bg-[var(--th-btn-bg)] px-5 py-3 text-sm font-medium text-[var(--th-btn-text)] shadow-[0_4px_14px_rgba(99,102,241,0.35)] transition-all hover:-translate-y-px hover:bg-[var(--th-btn-hover)] active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:bg-zinc-800 dark:disabled:text-slate-500"
              disabled={!selectedNames.size || confirmLoading}
              onClick={handleConfirm}
            >
              {confirmLoading
                ? "处理中..."
                : `添加到黑名单${selectedNames.size > 0 ? ` (${selectedNames.size})` : ""}`}
            </button>
          </div>
        </div>
      </CustomModal>

      {/* 视频预览模态框 */}
      <CustomModal
        open={videoPreview.open}
        onCancel={closeVideoPreview}
        footer={null}
        title={videoPreview.title || "视频预览"}
        width={720}
        destroyOnClose
      >
        {videoPreview.src && (
          <LocalVideo
            src={videoPreview.src}
            controls
            autoPlay
            className="w-full rounded-lg"
            style={{ maxHeight: "70vh" }}
          />
        )}
      </CustomModal>

      {/* 音频预览模态框 */}
      <CustomModal
        open={audioPreview.open}
        onCancel={closeAudioPreview}
        footer={null}
        title={audioPreview.title || "音频预览"}
        width={480}
        destroyOnClose
      >
        {audioPreview.src && (
          <LocalAudio src={audioPreview.src} controls autoPlay className="w-full" />
        )}
      </CustomModal>

      {/* 图片预览 - Portal 全屏 */}
      {imagePreview.open &&
        createPortal(
          <div
            className="z-11000 fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={closeImagePreview}
          >
            {/* 关闭按钮 */}
            <button
              className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
              onClick={closeImagePreview}
            >
              <X className="h-6 w-6" />
            </button>

            {/* 图片 */}
            <div className="max-h-[90vh] max-w-[90vw] p-4" onClick={e => e.stopPropagation()}>
              <LocalImage
                url={imagePreview.src}
                alt={imagePreview.title}
                className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain shadow-2xl"
              />
            </div>

            {/* 标题 */}
            <div className="absolute bottom-4 left-1/2 max-w-[80vw] -translate-x-1/2 truncate rounded-lg bg-black/50 px-4 py-2 text-sm text-white">
              {imagePreview.title}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default ResourceSyncBlacklistModal;
