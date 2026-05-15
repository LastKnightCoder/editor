import { useState, useCallback } from "react";
import { LoadingOutlined } from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import useRssStore from "@/stores/useRssStore";
import useThemeColors from "@/hooks/useThemeColors";

interface AddFeedDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function AddFeedDialog({ open, onClose }: AddFeedDialogProps) {
  const themeColors = useThemeColors();
  const { categories, subscribe, discoverFeeds } = useRssStore();

  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [discovered, setDiscovered] = useState<
    { url: string; title: string; type: string }[]
  >([]);

  const handleDiscover = useMemoizedFn(async () => {
    if (!url.trim()) return;
    setLoading(true);
    try {
      const feeds = await discoverFeeds(url.trim());
      setDiscovered(
        feeds.length > 0
          ? feeds
          : [{ url: url.trim(), title: url.trim(), type: "rss" }],
      );
    } finally {
      setLoading(false);
    }
  });

  const handleSubscribe = useMemoizedFn(
    async (feedUrl: string, title?: string) => {
      setLoading(true);
      try {
        await subscribe(feedUrl, category || undefined, title);
        handleClose();
      } finally {
        setLoading(false);
      }
    },
  );

  const handleClose = useCallback(() => {
    setUrl("");
    setCategory("");
    setDiscovered([]);
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
                    className={`ml-3 flex-shrink-0 rounded-md px-3 py-1 text-xs font-medium border-none cursor-pointer transition-colors duration-150 ${themeColors.primaryButtonClass}`}
                    onClick={() => handleSubscribe(feed.url, feed.title)}
                    disabled={loading}
                  >
                    订阅
                  </button>
                </div>
              ))}
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
