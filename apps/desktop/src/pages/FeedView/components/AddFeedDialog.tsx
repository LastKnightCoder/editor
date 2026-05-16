import { useState, useCallback } from "react";
import { LoadingOutlined } from "@ant-design/icons";
import { message } from "antd";
import { useMemoizedFn } from "ahooks";
import useRssStore from "@/stores/useRssStore";
import useThemeColors from "@/hooks/useThemeColors";
import type { RssFeedPreviewResult } from "@/types";

interface AddFeedDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function AddFeedDialog({ open, onClose }: AddFeedDialogProps) {
  const themeColors = useThemeColors();
  const { categories, subscribe, discoverFeeds, previewFeed } = useRssStore();

  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RssFeedPreviewResult | null>(null);
  const [discovered, setDiscovered] = useState<
    { url: string; title: string; type: string }[]
  >([]);

  const handleDiscover = useMemoizedFn(async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const feeds = await discoverFeeds(url.trim());
      setDiscovered(feeds);
      if (feeds.length === 0) {
        setError("未发现 RSS/Atom 源，可尝试把当前地址作为 Feed URL 验证。");
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
      const result = await previewFeed(feedUrl.trim());
      setPreview(result);
      if (!result.valid) {
        setError(result.message);
      }
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
        await subscribe(feedUrl, category || undefined, title);
        message.success("订阅成功");
        handleClose();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "订阅失败";
        setError(msg);
        message.error(msg);
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
    onClose();
  }, [onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className={`w-[460px] rounded-xl p-6 shadow-xl ${themeColors.modalPanelBg}`}
      >
        <h2 className="m-0 mb-5 text-base font-semibold">添加订阅</h2>

        <input
          type="text"
          placeholder="输入网站或 Feed URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleDiscover()}
          className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${themeColors.borderClass} ${themeColors.inputBgClass} ${themeColors.focusBorderClass}`}
        />

        <input
          type="text"
          placeholder="分类（可选）"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          list="feed-categories"
          className={`mt-2 w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${themeColors.borderClass} ${themeColors.inputBgClass} ${themeColors.focusBorderClass}`}
        />
        <datalist id="feed-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        <button
          className={`mt-3 w-full rounded-lg py-2 text-sm font-medium border-none cursor-pointer transition-colors duration-150 ${themeColors.primaryButtonClass}`}
          onClick={handleDiscover}
          disabled={loading || !url.trim()}
        >
          {loading ? <LoadingOutlined className="mr-1" /> : null}
          发现 Feed
        </button>

        <button
          className={`mt-3 w-full rounded-lg py-2 text-sm border cursor-pointer bg-transparent ${themeColors.secondaryTextClass} ${themeColors.hoverClass} transition-colors duration-150`}
          onClick={() => handlePreview(url)}
          disabled={loading || !url.trim()}
        >
          {loading ? <LoadingOutlined className="mr-1" /> : null}
          验证当前地址
        </button>

        {error && (
          <div className="mt-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-500">
            {error}
          </div>
        )}

        {discovered.length > 0 && (
          <div className="mt-4">
            <div
              className={`text-xs font-medium mb-2 ${themeColors.secondaryTextClass}`}
            >
              发现的 Feed:
            </div>
            <div className="flex flex-col gap-2">
              {discovered.map((feed) => (
                <div
                  key={feed.url}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${themeColors.borderClass}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {feed.title}
                    </div>
                    <div
                      className={`text-xs truncate mt-0.5 ${themeColors.secondaryTextClass}`}
                    >
                      {feed.url}
                    </div>
                  </div>
                  <button
                    className={`ml-3 shrink-0 rounded-md px-3 py-1 text-xs font-medium border-none cursor-pointer transition-colors duration-150 ${themeColors.primaryButtonClass}`}
                    onClick={() => handlePreview(feed.url)}
                    disabled={loading}
                  >
                    预览
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {preview?.valid && (
          <div className="mt-4">
            <div
              className={`text-xs font-medium mb-2 ${themeColors.secondaryTextClass}`}
            >
              Feed 预览:
            </div>
            <div
              className={`rounded-lg border px-3 py-2.5 ${themeColors.borderClass}`}
            >
              <div className="text-sm font-medium truncate">
                {preview.title}
              </div>
              <div
                className={`text-xs truncate mt-0.5 ${themeColors.secondaryTextClass}`}
              >
                {preview.finalUrl}
              </div>
              {preview.entriesPreview.length > 0 && (
                <div className="mt-3 flex flex-col gap-1.5">
                  {preview.entriesPreview.map((entry, index) => (
                    <div
                      key={`${entry.url || entry.title}-${index}`}
                      className={`truncate text-xs ${themeColors.secondaryTextClass}`}
                    >
                      {entry.title}
                    </div>
                  ))}
                </div>
              )}
              <button
                className={`mt-3 w-full rounded-md px-3 py-1.5 text-xs font-medium border-none cursor-pointer transition-colors duration-150 ${themeColors.primaryButtonClass}`}
                onClick={() => handleSubscribe(preview.finalUrl, preview.title)}
                disabled={loading}
              >
                订阅此 Feed
              </button>
            </div>
          </div>
        )}

        <button
          className={`mt-4 w-full rounded-lg py-2 text-sm border-none cursor-pointer bg-transparent ${themeColors.secondaryTextClass} ${themeColors.hoverClass} transition-colors duration-150`}
          onClick={handleClose}
        >
          取消
        </button>
      </div>
    </div>
  );
}
