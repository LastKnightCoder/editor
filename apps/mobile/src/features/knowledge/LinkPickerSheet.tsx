// 关联选择器：从卡片库 / 文章列表挑一条，作为引用节点挂到当前节点下。
// 关联只是引用：原内容更新时，这里同步可见。

import { useMemo, useState } from "react";
import { FileText, Layers, Search } from "lucide-react";
import BottomSheet from "../../components/BottomSheet";
import { useQuery } from "@tanstack/react-query";
import * as tauri from "../../services/tauri";
import { clampText } from "../../utils/richTextText";

type LinkPickerSheetProps = {
  open: boolean;
  onClose: () => void;
  onPick: (pick: { refType: "card" | "article"; refId: number; title: string }) => void;
};

export function LinkPickerSheet(props: LinkPickerSheetProps) {
  const [tab, setTab] = useState<"card" | "article">("card");
  const [query, setQuery] = useState("");

  const { data: cardsData } = useQuery({
    queryKey: ["knowledge", "linkPicker", "cards", query],
    queryFn: () => tauri.getCardsOverview({ query, category: "all", page: 1, pageSize: 50 }),
    enabled: props.open && tab === "card",
    staleTime: 15_000,
  });
  const { data: articlesData } = useQuery({
    queryKey: ["knowledge", "linkPicker", "articles", query],
    queryFn: () => tauri.articleList({ offset: 0, limit: 100 }),
    enabled: props.open && tab === "article",
    staleTime: 15_000,
  });

  const articles = useMemo(() => {
    const items = articlesData?.items ?? [];
    if (!query.trim()) {
      return items;
    }
    const keyword = query.trim().toLowerCase();
    return items.filter(a => a.title.toLowerCase().includes(keyword));
  }, [articlesData, query]);

  const handleClose = () => {
    setQuery("");
    props.onClose();
  };

  return (
    <BottomSheet open={props.open} title="添加关联" onClose={handleClose}>
      <p className="text-ink-3 -mt-1 mb-3 text-xs">关联只是引用：原内容更新时，这里同步可见</p>
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border-[1.5px] py-2.5 text-[13px] font-bold transition-colors ${
            tab === "card" ? "border-accent bg-accent-soft text-ink" : "border-line text-ink-2"
          }`}
          onClick={() => setTab("card")}
        >
          <Layers size={15} strokeWidth={2.2} />
          卡片
        </button>
        <button
          type="button"
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border-[1.5px] py-2.5 text-[13px] font-bold transition-colors ${
            tab === "article" ? "border-accent bg-accent-soft text-ink" : "border-line text-ink-2"
          }`}
          onClick={() => setTab("article")}
        >
          <FileText size={15} strokeWidth={2.2} />
          文章
        </button>
      </div>
      <div className="bg-input mb-3 flex items-center gap-2.5 rounded-[14px] px-3.5 py-2.5">
        <Search size={15} strokeWidth={2} className="text-ink-3 shrink-0" />
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={tab === "card" ? "搜索卡片…" : "搜索文章…"}
          className="text-ink caret-accent placeholder:text-ink-3 w-full border-none bg-transparent text-[14px] outline-none"
        />
      </div>
      <div className="bg-input max-h-[44dvh] overflow-y-auto rounded-2xl">
        {tab === "card"
          ? (cardsData?.items ?? []).map((card, index) => (
              <button
                key={card.id}
                type="button"
                className={`active:bg-press flex w-full items-center gap-3 px-3.5 py-3 text-left ${
                  index > 0 ? "border-line border-t-[1.5px] border-dashed" : ""
                }`}
                onClick={() => {
                  props.onPick({
                    refType: "card",
                    refId: card.id,
                    title: clampText(card.excerpt, 24) || `卡片 #${card.id}`,
                  });
                  handleClose();
                }}
              >
                <span className="bg-apricot-soft text-apricot grid h-8 w-8 shrink-0 place-items-center rounded-xl">
                  <Layers size={15} strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-ink block truncate text-[13.5px] font-bold">
                    {clampText(card.excerpt, 22) || "（无正文）"}
                  </span>
                  <span className="text-ink-3 block text-[11px]">{card.category}</span>
                </span>
              </button>
            ))
          : articles.map((article, index) => (
              <button
                key={article.id}
                type="button"
                className={`active:bg-press flex w-full items-center gap-3 px-3.5 py-3 text-left ${
                  index > 0 ? "border-line border-t-[1.5px] border-dashed" : ""
                }`}
                onClick={() => {
                  props.onPick({
                    refType: "article",
                    refId: article.id,
                    title: article.title,
                  });
                  handleClose();
                }}
              >
                <span className="bg-rose-soft text-rose grid h-8 w-8 shrink-0 place-items-center rounded-xl">
                  <FileText size={15} strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-ink block truncate text-[13.5px] font-bold">
                    {article.title}
                  </span>
                  <span className="text-ink-3 block text-[11px]">
                    {article.count.toLocaleString()} 字
                  </span>
                </span>
              </button>
            ))}
        {tab === "card" && (cardsData?.items ?? []).length === 0 ? (
          <p className="text-ink-3 py-6 text-center text-xs">没有匹配的卡片</p>
        ) : null}
        {tab === "article" && articles.length === 0 ? (
          <p className="text-ink-3 py-6 text-center text-xs">没有匹配的文章</p>
        ) : null}
      </div>
    </BottomSheet>
  );
}

export default LinkPickerSheet;
