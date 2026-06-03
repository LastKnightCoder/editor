import { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useMemoizedFn } from "ahooks";
import useRssStore from "@/stores/useRssStore";
import type { RssFeedPreviewResult } from "@/types";
import { BILIBILI_DEFAULT_CATEGORY } from "@/commands/rss";

interface AddFeedDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function AddFeedDialog({ open, onClose }: AddFeedDialogProps) {
  const { categories, subscribe, discoverFeeds, previewFeed } = useRssStore();

  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [preview, setPreview] = useState<RssFeedPreviewResult | null>(null);
  const [discovered, setDiscovered] = useState<
    { url: string; title: string; type: string }[]
  >([]);

  const previewFeedUrl = useMemoizedFn(async (feedUrl: string) => {
    const result = await previewFeed(feedUrl.trim());
    setPreview(result);
    if (!result.valid) {
      setError(result.message);
    }
  });

  const handleDiscover = useMemoizedFn(async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    setDiscovered([]);
    try {
      const feeds = await discoverFeeds(url.trim());
      if (feeds.length === 0) {
        setError("未发现 RSS/Atom 源，请确认网站是否提供订阅源。");
      } else if (feeds.length === 1) {
        await previewFeedUrl(feeds[0].url);
      } else {
        setDiscovered(feeds);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "发现 Feed 失败");
    } finally {
      setLoading(false);
    }
  });

  const handlePreview = useMemoizedFn(async (feedUrl: string) => {
    if (!feedUrl.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await previewFeedUrl(feedUrl);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "验证 Feed 失败");
    } finally {
      setLoading(false);
    }
  });

  const handleSubscribe = useMemoizedFn(
    async (feedUrl: string, title?: string) => {
      setLoading(true);
      setError(null);
      try {
        const defaultCategory = feedUrl.startsWith("tau://rss/bilibili/")
          ? BILIBILI_DEFAULT_CATEGORY
          : undefined;
        await subscribe(feedUrl, category || defaultCategory, title);
        setSuccess("订阅成功");
        setTimeout(() => handleClose(), 800);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "订阅失败";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
  );

  const handleClose = useCallback(() => {
    setUrl("");
    setCategory("");
    setDiscovered([]);
    setPreview(null);
    setError(null);
    setSuccess(null);
    onClose();
  }, [onClose]);

  if (!open) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={() => handleClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="w-full max-w-[480px] m-4 max-h-[80vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="rounded-2xl p-6 shadow-2xl bg-white dark:bg-zinc-900/95 border border-gray-200 dark:border-slate-800 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-start gap-3 mb-5 shrink-0">
              <div className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center bg-orange-50 dark:bg-orange-500/20 border border-orange-200 dark:border-orange-500/30">
                <svg
                  className="w-5 h-5 text-orange-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M4 11a9 9 0 0 1 9 9" />
                  <path d="M4 4a16 16 0 0 1 16 16" />
                  <circle cx="5" cy="19" r="1" fill="currentColor" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold m-0 text-gray-800 dark:text-white">
                  添加订阅
                </h2>
                <p className="text-xs mt-0.5 text-gray-500 dark:text-slate-500">
                  输入网站或 Feed 地址，自动查找可订阅源
                </p>
              </div>
              <button
                onClick={handleClose}
                className="shrink-0 w-8 h-8 rounded-lg border-none cursor-pointer flex items-center justify-center transition-all bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-zinc-700 hover:text-gray-700 dark:hover:text-slate-200"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto scrollbar-thin pr-1 min-h-0">
              <div className="space-y-4">
                {/* URL Input */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                    网站 / Feed 地址
                  </label>
                  <input
                    type="text"
                    placeholder="输入网站或 Feed URL"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleDiscover()}
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-orange-500 focus:shadow-[0_0_0_3px_rgba(249,115,22,0.15)] dark:focus:shadow-[0_0_0_3px_rgba(249,115,22,0.25)]"
                  />
                </div>

                {/* Category Input */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                    分类（可选）
                  </label>
                  <input
                    type="text"
                    placeholder="输入或选择分类"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    list="feed-categories"
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-orange-500 focus:shadow-[0_0_0_3px_rgba(249,115,22,0.15)] dark:focus:shadow-[0_0_0_3px_rgba(249,115,22,0.25)]"
                  />
                  <datalist id="feed-categories">
                    {categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                {/* Action Buttons */}
                <button
                  className="w-full px-4 py-3 rounded-xl border-none text-sm font-semibold cursor-pointer transition-all bg-orange-500 text-white shadow-[0_4px_14px_rgba(249,115,22,0.35)] hover:bg-orange-600 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-zinc-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none"
                  onClick={handleDiscover}
                  disabled={loading || !url.trim()}
                >
                  {loading && (
                    <svg
                      className="inline-block w-4 h-4 mr-1.5 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeDasharray="60"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                  发现 Feed
                </button>

                {/* Error Message */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-xs text-red-600 dark:text-red-400"
                  >
                    {error}
                  </motion.div>
                )}

                {/* Success Message */}
                {success && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-green-200 dark:border-green-500/30 bg-green-50 dark:bg-green-500/10 px-4 py-3 text-xs text-green-600 dark:text-green-400"
                  >
                    {success}
                  </motion.div>
                )}

                {/* Discovered Feeds */}
                {discovered.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                      发现的 Feed
                    </label>
                    <div className="mt-2 flex flex-col gap-2">
                      {discovered.map((feed) => (
                        <div
                          key={feed.url}
                          className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-zinc-950 px-4 py-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate text-gray-800 dark:text-white">
                              {feed.title}
                            </div>
                            <div className="text-[11px] truncate mt-0.5 text-gray-500 dark:text-slate-500">
                              {feed.url}
                            </div>
                          </div>
                          <button
                            className="ml-3 shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium border-none cursor-pointer transition-all bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => handlePreview(feed.url)}
                            disabled={loading}
                          >
                            预览
                          </button>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Feed Preview */}
                {preview?.valid && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                      Feed 预览
                    </label>
                    <div className="mt-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-zinc-950 px-4 py-3">
                      <div className="text-sm font-medium truncate text-gray-800 dark:text-white">
                        {preview.title}
                      </div>
                      <div className="text-[11px] truncate mt-0.5 text-gray-500 dark:text-slate-500">
                        {preview.finalUrl}
                      </div>
                      {preview.entriesPreview.length > 0 && (
                        <div className="mt-3 flex flex-col gap-1.5 border-t border-gray-200 dark:border-slate-700 pt-3">
                          {preview.entriesPreview.map((entry, index) => (
                            <div
                              key={`${entry.url || entry.title}-${index}`}
                              className="truncate text-xs text-gray-600 dark:text-slate-400"
                            >
                              {entry.title}
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        className="mt-3 w-full px-4 py-3 rounded-xl border-none text-sm font-semibold cursor-pointer transition-all bg-orange-500 text-white shadow-[0_4px_14px_rgba(249,115,22,0.35)] hover:bg-orange-600 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-zinc-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none"
                        onClick={() =>
                          handleSubscribe(preview.finalUrl, preview.title)
                        }
                        disabled={loading}
                      >
                        订阅此 Feed
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end pt-4 mt-4 border-t border-gray-200 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-3 rounded-xl text-sm font-semibold cursor-pointer transition-all bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-zinc-700"
              >
                取消
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
