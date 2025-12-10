import { useEffect } from "react";
import { Layers } from "lucide-react";
import CustomModal from "@/components/CustomModal";
import useFlashcardStore from "@/stores/useFlashcardStore";
import type { FlashcardDeck } from "@/types";

interface DeckSelectorModalProps {
  open: boolean;
  onCancel: () => void;
  onSelect: (deck: FlashcardDeck) => void;
  title?: string;
  subtitle?: string;
}

const DeckSelectorModal = ({
  open,
  onCancel,
  onSelect,
  title = "选择卡组",
  subtitle = "选择要添加闪卡的卡组",
}: DeckSelectorModalProps) => {
  const { decks, loadingDecks, fetchDecks } = useFlashcardStore((state) => ({
    decks: state.decks,
    loadingDecks: state.loadingDecks,
    fetchDecks: state.fetchDecks,
  }));

  useEffect(() => {
    if (open && decks.length === 0) {
      fetchDecks();
    }
  }, [open, decks.length, fetchDecks]);

  const handleSelect = (deck: FlashcardDeck) => {
    onSelect(deck);
    onCancel();
  };

  return (
    <CustomModal
      open={open}
      onCancel={onCancel}
      width="500px"
      centered
      footer={null}
      title={title}
      subtitle={subtitle}
      icon={<Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
      iconBgColor="bg-indigo-50 dark:bg-indigo-500/20 border-indigo-200 dark:border-indigo-500/30"
    >
      <div className="space-y-2 max-h-[400px] overflow-auto">
        {loadingDecks && (
          <div className="text-center py-8 text-gray-500 dark:text-slate-400">
            加载中...
          </div>
        )}

        {!loadingDecks && decks.length === 0 && (
          <div className="text-center py-8">
            <Layers className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-slate-600" />
            <p className="text-gray-500 dark:text-slate-400 mb-2">
              还没有任何卡组
            </p>
            <p className="text-sm text-gray-400 dark:text-slate-500">
              请先在闪卡中心创建卡组
            </p>
          </div>
        )}

        {!loadingDecks &&
          decks.map((deck) => (
            <button
              key={deck.id}
              onClick={() => handleSelect(deck)}
              className="w-full text-left p-4 rounded-xl border border-gray-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/10 transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{deck.emoji || "📚"}</span>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-gray-800 dark:text-white truncate">
                    {deck.name}
                  </h4>
                  {deck.description && (
                    <p className="text-sm text-gray-500 dark:text-slate-400 truncate">
                      {deck.description}
                    </p>
                  )}
                </div>
                <div className="text-xs text-gray-400 dark:text-slate-500">
                  {deck.stats?.totalCards || 0} 张卡
                </div>
              </div>
            </button>
          ))}
      </div>
    </CustomModal>
  );
};

export default DeckSelectorModal;
