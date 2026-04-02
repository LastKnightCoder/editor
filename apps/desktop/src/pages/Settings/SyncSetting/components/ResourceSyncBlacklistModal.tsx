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

  const blacklistSet = useMemo(
    () => new Set(blacklistNames || []),
    [blacklistNames],
  );

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
      result = result.filter((resource) => resource.type === typeFilter);
    }
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.trim().toLowerCase();
      result = result.filter(
        (resource) =>
          resource.name.toLowerCase().includes(keyword) ||
          resource.path.toLowerCase().includes(keyword),
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

    setSelectedNames((prev) => {
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
    setImagePreview((prev) => ({ ...prev, open: false }));
  }, []);

  const openVideoPreview = useCallback((src: string, title: string) => {
    setVideoPreview({ open: true, src, title });
  }, []);

  const closeVideoPreview = useCallback(() => {
    setVideoPreview((prev) => ({ ...prev, open: false }));
  }, []);

  const openAudioPreview = useCallback((src: string, title: string) => {
    setAudioPreview({ open: true, src, title });
  }, []);

  const closeAudioPreview = useCallback(() => {
    setAudioPreview((prev) => ({ ...prev, open: false }));
  }, []);

  return (
    <>
      <CustomModal
        open={open}
        onCancel={onClose}
        title="管理资源黑名单"
        width={720}
        footer={null}
      >
        <div className="flex flex-col gap-4">
          {/* 搜索和过滤栏 */}
          <div className="flex flex-wrap gap-3 items-center">
            <input
              type="text"
              placeholder="搜索文件名或路径"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="flex-1 min-w-[200px] px-4 py-3 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(99,102,241,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(99,102,241,0.25)]"
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
                <span className="ml-2 text-indigo-500">
                  · 已选 {selectedNames.size} 个
                </span>
              )}
            </span>
            {selectedNames.size > 0 && (
              <button
                className="text-indigo-500 hover:text-indigo-600 transition-colors"
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
              <div className="flex items-center justify-center h-full">
                <Spin />
              </div>
            ) : filteredResources.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <Empty description="暂无资源" />
              </div>
            ) : (
              <div
                style={{
                  height: rowVirtualizer.getTotalSize(),
                  position: "relative",
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const resource = filteredResources[virtualRow.index];
                  const isChecked = selectedNames.has(resource.name);
                  const disabled = blacklistSet.has(resource.name);

                  return (
                    <div
                      key={resource.id}
                      className={classNames(
                        "px-4 py-3 cursor-pointer flex items-center gap-3 transition-all",
                        // 选中状态
                        isChecked
                          ? "bg-indigo-50/80 dark:bg-indigo-900/20"
                          : "hover:bg-gray-50 dark:hover:bg-zinc-800/50",
                        // 分隔线
                        "border-b border-gray-100 dark:border-slate-800 last:border-b-0",
                        // 禁用状态
                        disabled && "opacity-50",
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
                        onImageClick={() =>
                          openImagePreview(resource.path, resource.name)
                        }
                        onVideoClick={() =>
                          openVideoPreview(resource.path, resource.name)
                        }
                        onAudioClick={() =>
                          openAudioPreview(resource.path, resource.name)
                        }
                      />

                      {/* 文件信息 */}
                      <div className="flex-1 min-w-0">
                        <div
                          className={classNames(
                            "font-medium text-sm truncate",
                            disabled
                              ? "text-gray-400 dark:text-slate-500"
                              : "text-gray-800 dark:text-white",
                          )}
                        >
                          {resource.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-slate-400 truncate mt-0.5">
                          {resource.path}
                        </div>
                      </div>

                      {/* 类型标签 */}
                      <span
                        className={classNames(
                          "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0",
                          "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-slate-400",
                        )}
                      >
                        {resource.type}
                      </span>

                      {/* 已在黑名单标记 */}
                      {disabled && (
                        <span className="text-[10px] text-red-500 dark:text-red-400 shrink-0 whitespace-nowrap">
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
              className="px-5 py-3 rounded-xl text-sm font-medium transition-all bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-zinc-700"
              onClick={onClose}
            >
              取消
            </button>
            <button
              className="px-5 py-3 rounded-xl text-sm font-medium transition-all bg-indigo-500 text-white shadow-[0_4px_14px_rgba(99,102,241,0.35)] hover:bg-indigo-600 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-zinc-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:shadow-none disabled:cursor-not-allowed disabled:translate-y-0"
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
          <LocalAudio
            src={audioPreview.src}
            controls
            autoPlay
            className="w-full"
          />
        )}
      </CustomModal>

      {/* 图片预览 - Portal 全屏 */}
      {imagePreview.open &&
        createPortal(
          <div
            className="fixed inset-0 z-11000 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={closeImagePreview}
          >
            {/* 关闭按钮 */}
            <button
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
              onClick={closeImagePreview}
            >
              <X className="w-6 h-6" />
            </button>

            {/* 图片 */}
            <div
              className="max-h-[90vh] max-w-[90vw] p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <LocalImage
                url={imagePreview.src}
                alt={imagePreview.title}
                className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain shadow-2xl"
              />
            </div>

            {/* 标题 */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-black/50 text-white text-sm max-w-[80vw] truncate">
              {imagePreview.title}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

export default ResourceSyncBlacklistModal;
