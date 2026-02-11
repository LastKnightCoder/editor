import { memo, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { useMemoizedFn, useDebounceFn } from "ahooks";
import { searchNotionPages, getNotionPageInfo } from "@/commands/notion";
import { parseNotionBlockId } from "@/utils/notion";
import "./index.css";

export interface NotionSyncConfig {
  syncMode: "bidirectional" | "json";
  pageId: string;
  pageTitle: string;
  createNew: boolean;
  parentId?: string;
}

interface NotionSyncModalProps {
  open: boolean;
  token: string;
  onOk: (config: NotionSyncConfig) => Promise<void>;
  onCancel: () => void;
  initialConfig?: Partial<NotionSyncConfig>;
}

const NotionSyncModal = memo((props: NotionSyncModalProps) => {
  const { open, token, onOk, onCancel, initialConfig } = props;

  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [pageOptions, setPageOptions] = useState<
    Array<{ label: string; value: string }>
  >([]);
  const [syncMode, setSyncMode] = useState<"bidirectional" | "json">(
    initialConfig?.syncMode || "json",
  );
  const [pageInfo, setPageInfo] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [pageInfoLoading, setPageInfoLoading] = useState(false);
  const [createMode, setCreateMode] = useState<"existing" | "new">("existing");
  const [parentPageInfo, setParentPageInfo] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [parentSearchLoading, setParentSearchLoading] = useState(false);
  const [parentPageOptions, setParentPageOptions] = useState<
    Array<{ label: string; value: string }>
  >([]);

  const [pageInput, setPageInput] = useState("");
  const [pageTitle, setPageTitle] = useState("");
  const [parentPageInput, setParentPageInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const pageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSyncMode(initialConfig?.syncMode || "json");
      setCreateMode("existing");
      setPageOptions([]);
      setPageInfo(null);
      setParentPageInfo(null);
      setPageInput("");
      setPageTitle("");
      setParentPageInput("");
      setError(null);
      setParentPageOptions([]);
      setTimeout(() => pageInputRef.current?.focus(), 100);
    }
  }, [open, initialConfig]);

  const { run: handleInputChange } = useDebounceFn(
    async (input: string) => {
      if (!input || !token) {
        setPageOptions([]);
        setPageInfo(null);
        return;
      }

      const pageId = parseNotionBlockId(input);

      if (pageId) {
        setPageInfoLoading(true);
        setPageOptions([]);
        try {
          const result = await getNotionPageInfo(token, pageId);
          if (result.success && result.title) {
            const info = { id: pageId, title: result.title };
            setPageInfo(info);
            setPageTitle(result.title);
          } else {
            setPageInfo(null);
            setError(result.error || "获取页面信息失败");
          }
        } catch (error) {
          console.error("获取页面信息失败:", error);
          setPageInfo(null);
        } finally {
          setPageInfoLoading(false);
        }
      } else {
        if (input.length < 2) {
          setPageOptions([]);
          return;
        }

        setSearchLoading(true);
        setPageInfo(null);
        try {
          const result = await searchNotionPages(token, input);
          if (result.success && result.pages) {
            setPageOptions(
              result.pages.map((page) => ({
                label: page.title || "无标题",
                value: page.id,
              })),
            );
          }
        } catch (error) {
          console.error("搜索页面失败:", error);
        } finally {
          setSearchLoading(false);
        }
      }
    },
    { wait: 500 },
  );

  const { run: handleParentPageInput } = useDebounceFn(
    async (input: string) => {
      if (!input || !token) {
        setParentPageInfo(null);
        setParentPageOptions([]);
        return;
      }

      const pageId = parseNotionBlockId(input);

      if (pageId) {
        setPageInfoLoading(true);
        setParentPageOptions([]);
        try {
          const result = await getNotionPageInfo(token, pageId);
          if (result.success && result.title) {
            setParentPageInfo({ id: pageId, title: result.title });
          } else {
            setParentPageInfo(null);
            setError(result.error || "获取页面信息失败");
          }
        } catch (error) {
          console.error("获取父页面信息失败:", error);
          setParentPageInfo(null);
        } finally {
          setPageInfoLoading(false);
        }
      } else {
        if (input.length < 2) {
          setParentPageOptions([]);
          return;
        }

        setParentSearchLoading(true);
        setParentPageInfo(null);
        try {
          const result = await searchNotionPages(token, input);
          if (result.success && result.pages) {
            setParentPageOptions(
              result.pages.map((page) => ({
                label: page.title || "无标题",
                value: page.id,
              })),
            );
          }
        } catch (error) {
          console.error("搜索父页面失败:", error);
        } finally {
          setParentSearchLoading(false);
        }
      }
    },
    { wait: 500 },
  );

  const handleSubmit = useMemoizedFn(async () => {
    setError(null);

    if (createMode === "new") {
      if (!parentPageInfo && !parentPageInput) {
        setError("请输入父页面链接、ID 或搜索页面");
        return;
      }
      if (!pageTitle.trim()) {
        setError("请输入新页面标题");
        return;
      }

      setLoading(true);
      try {
        await onOk({
          syncMode,
          pageId: "",
          pageTitle: pageTitle.trim(),
          createNew: true,
          parentId: parentPageInfo?.id || parentPageInput,
        });
      } catch (error: any) {
        setError(error.message || "创建失败");
      } finally {
        setLoading(false);
      }
    } else {
      if (!pageInfo && !pageInput) {
        setError("请输入 Notion 页面链接或搜索页面");
        return;
      }
      if (!pageTitle.trim()) {
        setError("请输入文档标题");
        return;
      }

      setLoading(true);
      try {
        await onOk({
          syncMode,
          pageId: pageInfo?.id || pageInput,
          pageTitle: pageTitle.trim(),
          createNew: false,
        });
      } catch (error: any) {
        setError(error.message || "关联失败");
      } finally {
        setLoading(false);
      }
    }
  });

  if (!open) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="notion-sync-overlay fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={onCancel}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="notion-sync-container w-full max-w-[560px] m-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="rounded-2xl p-6 shadow-2xl bg-white dark:bg-slate-900/95 border border-gray-200 dark:border-slate-800">
              {/* Header */}
              <div className="flex items-start gap-3 mb-5">
                <div className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
                  <svg
                    className="w-5 h-5 text-gray-900 dark:text-gray-100"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M4 4h16v16H4V4zm2 2v12h12V6H6z" />
                    <path d="M8 8h8v2H8V8zm0 4h8v2H8v-2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold m-0 text-gray-800 dark:text-white">
                    Notion 文档同步配置
                  </h2>
                  <p className="text-xs mt-0.5 text-gray-500 dark:text-slate-500">
                    配置与 Notion 的同步方式
                  </p>
                </div>
                <button
                  className="shrink-0 w-8 h-8 rounded-lg border-none cursor-pointer flex items-center justify-center transition-all bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-200"
                  onClick={onCancel}
                >
                  <svg
                    className="w-[18px] h-[18px]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Info Alert */}
              <div className="mb-4 px-3.5 py-2.5 rounded-lg text-[13px] bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-400">
                {syncMode === "bidirectional"
                  ? "双向编辑模式：本地和 Notion 都可编辑，但编辑器功能会受限"
                  : "JSON 同步模式：本地支持所有功能，Notion 中显示为代码块"}
              </div>

              {/* Form */}
              <div className="flex flex-col gap-4">
                {/* Sync Mode */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    同步模式
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-gray-100 dark:bg-slate-950">
                    <button
                      className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        syncMode === "json"
                          ? "bg-white dark:bg-slate-800 text-gray-900 dark:text-white shadow-sm"
                          : "text-gray-600 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200"
                      }`}
                      onClick={() => setSyncMode("json")}
                    >
                      JSON 同步 (推荐)
                    </button>
                    <button
                      className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        syncMode === "bidirectional"
                          ? "bg-white dark:bg-slate-800 text-gray-900 dark:text-white shadow-sm"
                          : "text-gray-600 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200"
                      }`}
                      onClick={() => setSyncMode("bidirectional")}
                    >
                      双向编辑 (受限)
                    </button>
                  </div>
                </div>

                {/* Create Mode */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    页面模式
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-gray-100 dark:bg-slate-950">
                    <button
                      className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        createMode === "existing"
                          ? "bg-white dark:bg-slate-800 text-gray-900 dark:text-white shadow-sm"
                          : "text-gray-600 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200"
                      }`}
                      onClick={() => setCreateMode("existing")}
                    >
                      关联现有页面
                    </button>
                    <button
                      className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        createMode === "new"
                          ? "bg-white dark:bg-slate-800 text-gray-900 dark:text-white shadow-sm"
                          : "text-gray-600 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200"
                      }`}
                      onClick={() => setCreateMode("new")}
                    >
                      创建新页面
                    </button>
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  {createMode === "existing" ? (
                    <motion.div
                      key="existing"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col gap-4"
                    >
                      {/* Page Input */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Notion 页面
                          <span className="text-xs ml-1 text-gray-500 dark:text-slate-500">
                            (粘贴链接、ID 或搜索标题)
                          </span>
                        </label>
                        <div className="relative">
                          <input
                            ref={pageInputRef}
                            type="text"
                            value={pageInput}
                            onChange={(e) => {
                              setPageInput(e.target.value);
                              handleInputChange(e.target.value);
                              setError(null);
                            }}
                            placeholder="粘贴 Notion 链接、页面 ID 或搜索页面标题"
                            className="w-full px-4 py-3 pr-10 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-gray-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(107,114,128,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(107,114,128,0.25)]"
                          />
                          {(pageInfoLoading || searchLoading) && (
                            <svg
                              className="notion-sync-spin absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                          )}
                        </div>
                      </div>

                      {/* Page Info */}
                      {pageInfo && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="px-3.5 py-2.5 rounded-lg text-[13px] bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                        >
                          <div className="font-medium mb-1">已识别页面</div>
                          <div className="font-semibold">{pageInfo.title}</div>
                          <div className="text-xs mt-1 opacity-75">
                            ID: {pageInfo.id}
                          </div>
                        </motion.div>
                      )}

                      {/* Search Results */}
                      {pageOptions.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="flex flex-col gap-1.5"
                        >
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            搜索结果
                          </label>
                          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                            {pageOptions.map((option) => (
                              <button
                                key={option.value}
                                className="px-4 py-2.5 rounded-lg text-left text-sm transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white hover:border-gray-400 dark:hover:border-slate-600"
                                onClick={() => {
                                  setPageInput(option.value);
                                  setPageTitle(option.label);
                                  setPageInfo({
                                    id: option.value,
                                    title: option.label,
                                  });
                                  setPageOptions([]);
                                }}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}

                      {/* Page Title */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          文档标题
                        </label>
                        <input
                          type="text"
                          value={pageTitle}
                          onChange={(e) => {
                            setPageTitle(e.target.value);
                            setError(null);
                          }}
                          placeholder="自动填充或手动输入文档标题"
                          className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-gray-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(107,114,128,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(107,114,128,0.25)]"
                        />
                      </div>

                      {/* Help Text */}
                      <div className="px-3.5 py-2.5 rounded-lg text-xs bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400">
                        <div className="font-semibold mb-1.5 text-gray-700 dark:text-gray-300">
                          关联现有页面的三种方式：
                        </div>
                        <div className="space-y-1">
                          <div>
                            <strong>1. 粘贴链接：</strong>在 Notion 中打开页面 →
                            复制链接 → 粘贴到输入框
                          </div>
                          <div>
                            <strong>2. 输入 ID：</strong>直接输入页面
                            ID（如：3b628e1d-84da-4c6c-900d-b6e4a28532e1）
                          </div>
                          <div>
                            <strong>3. 搜索标题：</strong>
                            输入关键词搜索页面（至少2个字符）
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="new"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col gap-4"
                    >
                      {/* Parent Page Input */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          父页面
                          <span className="text-xs ml-1 text-gray-500 dark:text-slate-500">
                            (在这个页面下创建新子页面)
                          </span>
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={parentPageInput}
                            onChange={(e) => {
                              setParentPageInput(e.target.value);
                              handleParentPageInput(e.target.value);
                              setError(null);
                            }}
                            placeholder="粘贴父页面链接、页面 ID 或搜索页面标题"
                            className="w-full px-4 py-3 pr-10 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-gray-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(107,114,128,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(107,114,128,0.25)]"
                          />
                          {(pageInfoLoading || parentSearchLoading) && (
                            <svg
                              className="notion-sync-spin absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                          )}
                        </div>
                      </div>

                      {/* Parent Page Info */}
                      {parentPageInfo && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="px-3.5 py-2.5 rounded-lg text-[13px] bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-400"
                        >
                          <div className="font-medium mb-1">已识别父页面</div>
                          <div className="font-semibold">
                            {parentPageInfo.title}
                          </div>
                          <div className="text-xs mt-1 opacity-75">
                            ID: {parentPageInfo.id}
                          </div>
                        </motion.div>
                      )}

                      {/* Parent Search Results */}
                      {parentPageOptions.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="flex flex-col gap-1.5"
                        >
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            搜索结果
                          </label>
                          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                            {parentPageOptions.map((option) => (
                              <button
                                key={option.value}
                                className="px-4 py-2.5 rounded-lg text-left text-sm transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white hover:border-gray-400 dark:hover:border-slate-600"
                                onClick={() => {
                                  setParentPageInput(option.value);
                                  setParentPageInfo({
                                    id: option.value,
                                    title: option.label,
                                  });
                                  setParentPageOptions([]);
                                }}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}

                      {/* New Page Title */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          新页面标题
                        </label>
                        <input
                          type="text"
                          value={pageTitle}
                          onChange={(e) => {
                            setPageTitle(e.target.value);
                            setError(null);
                          }}
                          placeholder="输入新页面的标题"
                          className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-gray-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(107,114,128,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(107,114,128,0.25)]"
                        />
                      </div>

                      {/* Help Text */}
                      <div className="px-3.5 py-2.5 rounded-lg text-xs bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400">
                        <div className="font-semibold mb-1.5 text-gray-700 dark:text-gray-300">
                          创建新页面的三种方式：
                        </div>
                        <div className="space-y-1">
                          <div>
                            <strong>1. 粘贴链接：</strong>在 Notion 中打开父页面
                            → 复制链接 → 粘贴到输入框
                          </div>
                          <div>
                            <strong>2. 输入 ID：</strong>直接输入父页面 ID
                          </div>
                          <div>
                            <strong>3. 搜索标题：</strong>
                            输入关键词搜索父页面（至少2个字符）
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Error Message */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="px-3.5 py-2.5 rounded-lg text-[13px] bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400"
                  >
                    {error}
                  </motion.div>
                )}

                {/* Submit Button */}
                <button
                  className="w-full px-5 py-3.5 rounded-xl border-none text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all bg-gray-700 dark:bg-gray-600 text-white shadow-[0_4px_14px_rgba(55,65,81,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-gray-800 dark:hover:bg-gray-700 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none dark:disabled:border dark:disabled:border-slate-700"
                  onClick={handleSubmit}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <svg
                        className="notion-sync-spin w-5 h-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      处理中...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-5 h-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      确认配置
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
});

export default NotionSyncModal;
