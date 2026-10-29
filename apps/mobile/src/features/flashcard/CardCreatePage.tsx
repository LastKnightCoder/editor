// 建卡第一步：选卡组 + 选题型（五题型瓷贴），随后进入 flashcardCardEdit。

import { useEffect, useMemo, useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { BottomSheet } from "../../components/BottomSheet";
import { useEdgeFade } from "../../hooks/useScrollState";
import { useFlashcardDecks } from "./queries";
import { DeckFormSheet } from "./DeckFormSheet";
import { toast } from "../../components/toast";
import { FLASHCARD_TYPE_META, FLASHCARD_TYPE_ORDER, FLASHCARD_TYPE_TONE } from "./constants";
import type { FlashcardType } from "./types";

const TYPE_TONE = FLASHCARD_TYPE_TONE;

type CardCreatePageProps = {
  defaultDeckId: number;
  /** 从内容详情进入时的来源标题（新卡将携带该参考资料） */
  referenceTitle?: string;
  onBack: () => void;
  onChoose: (deckId: number, type: FlashcardType) => void;
  createDeck?: (input: {
    name: string;
    description: string;
    coverColor: string;
    emoji: string;
  }) => Promise<{ id: number }>;
};

export function CardCreatePage({
  defaultDeckId,
  referenceTitle,
  onBack,
  onChoose,
  createDeck,
}: CardCreatePageProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef);
  const decksQuery = useFlashcardDecks();
  const decks = useMemo(() => decksQuery.data ?? [], [decksQuery.data]);
  const [deckId, setDeckId] = useState(defaultDeckId);
  // 从内容详情进入时 deckId=-1：默认选中第一个卡组，避免误建到不存在的分组
  useEffect(() => {
    if (defaultDeckId === -1 && deckId === -1 && decks.length > 0) {
      setDeckId(decks[0].id);
    }
  }, [defaultDeckId, deckId, decks]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const deck = decks.find(item => item.id === deckId);

  return (
    <div className="mobile-kb-screen bg-page flex h-full flex-col">
      <PageHeader title="新建闪卡" onBack={onBack} />
      {createDeck && (
        <button
          type="button"
          className="text-accent-text px-5 py-3 text-left"
          onClick={() => setCreateOpen(true)}
        >
          新建卡组
        </button>
      )}
      {createDeck && (
        <DeckFormSheet
          open={createOpen}
          deck={null}
          onClose={() => setCreateOpen(false)}
          onError={(error, fallback) =>
            toast.error(error instanceof Error ? error.message : fallback)
          }
          createDeck={async input => {
            const deck = await createDeck(input);
            setDeckId(deck.id);
          }}
        />
      )}
      <div ref={scrollRef} className="edge-fade-scroll mobile-page-scroll flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3.5 px-5 pt-2">
          <div className="bg-surface shadow-card rounded-[20px] p-4">
            <div className="text-ink-2 mb-2 text-[12.5px] font-extrabold">归属卡组</div>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex w-full items-center gap-3 text-left active:opacity-70"
            >
              <span className="bg-page grid h-[42px] w-[42px] place-items-center rounded-[13px] text-[20px]">
                {deck?.emoji ?? "🧠"}
              </span>
              <span className="flex-1">
                <span className="text-ink-1 block text-[14.5px] font-extrabold">
                  {deck?.name ?? "选择卡组"}
                </span>
                <span className="text-ink-2 mt-0.5 block text-[11px] font-semibold">
                  与桌面端数据互通
                </span>
              </span>
              <span className="text-ink-3">›</span>
            </button>
          </div>

          {referenceTitle ? (
            <div className="bg-tag-3-soft text-tag-3 flex items-center gap-2 rounded-[16px] px-4 py-3 text-[12px] font-bold">
              <Paperclip size={14} className="flex-none" />
              新卡将携带参考资料：「{referenceTitle}」
            </div>
          ) : null}

          <div className="text-ink-2 mt-1 px-1 text-[12.5px] font-extrabold">选择题型</div>
          {decks.length === 0 ? (
            <div className="border-line-1 text-ink-3 rounded-[16px] border-2 border-dashed py-4 text-center text-[13px] font-semibold">
              还没有卡组，先回闪卡主页创建一个再来建卡
            </div>
          ) : null}
          {FLASHCARD_TYPE_ORDER.map(type => {
            const tone = TYPE_TONE[type];
            return (
              <button
                key={type}
                type="button"
                disabled={decks.length === 0 || deckId === -1}
                onClick={() => onChoose(deckId, type)}
                className="bg-surface shadow-card active:bg-hover flex items-center gap-3.5 rounded-[20px] p-4 text-left disabled:opacity-45"
              >
                <span
                  className="grid h-[46px] w-[46px] flex-none place-items-center rounded-[14px] text-[20px] font-extrabold"
                  style={{ background: tone.soft, color: tone.color }}
                >
                  {tone.icon}
                </span>
                <span className="flex-1">
                  <span className="text-ink-1 block text-[15px] font-extrabold">
                    {FLASHCARD_TYPE_META[type].label}
                  </span>
                  <span className="text-ink-2 mt-0.5 block text-[11.5px] font-semibold">
                    {FLASHCARD_TYPE_META[type].description}
                  </span>
                </span>
                <span className="text-ink-3">›</span>
              </button>
            );
          })}
        </div>
      </div>

      <BottomSheet open={pickerOpen} title="选择卡组" onClose={() => setPickerOpen(false)}>
        <div className="flex flex-col gap-2 px-5 pb-7">
          {decks.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setDeckId(item.id);
                setPickerOpen(false);
              }}
              className={`active:bg-hover flex items-center gap-3 rounded-[16px] p-3 text-left ${
                item.id === deckId ? "bg-accent-soft" : "bg-page"
              }`}
            >
              <span className="text-[20px]">{item.emoji}</span>
              <span className="text-ink-1 flex-1 text-[14.5px] font-extrabold">{item.name}</span>
              <span className="text-ink-3 text-[11.5px] font-semibold">
                {item.stats?.totalCards ?? 0} 张
              </span>
            </button>
          ))}
          {decks.length === 0 ? (
            <div className="text-ink-3 py-4 text-center text-[13px] font-semibold">
              还没有卡组，请先回主页创建
            </div>
          ) : null}
        </div>
      </BottomSheet>
    </div>
  );
}
