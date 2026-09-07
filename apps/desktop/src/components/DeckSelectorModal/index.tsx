import { useEffect, useState } from "react";
import { Layers, Plus } from "lucide-react";
import CustomModal from "@/components/CustomModal";
import useFlashcardStore from "@/stores/useFlashcardStore";
import type { FlashcardDeck } from "@/types";
import DeckFormModal from "@/pages/FlashcardCenter/DeckFormModal";
import useThemeColors from "@/hooks/useThemeColors";

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
  const { decks, loadingDecks, fetchDecks } = useFlashcardStore(state => ({
    decks: state.decks,
    loadingDecks: state.loadingDecks,
    fetchDecks: state.fetchDecks,
  }));

  const themeColors = useThemeColors();
  const [createDeckModalOpen, setCreateDeckModalOpen] = useState(false);
  const [selectorVisible, setSelectorVisible] = useState(true);

  useEffect(() => {
    if (open && decks.length === 0) {
      fetchDecks();
    }
  }, [open, decks.length, fetchDecks]);

  useEffect(() => {
    // 当外部 open 状态改变时，重置内部显示状态
    if (open) {
      setSelectorVisible(true);
      setCreateDeckModalOpen(false);
    }
  }, [open]);

  const handleSelect = (deck: FlashcardDeck) => {
    onSelect(deck);
    onCancel();
  };

  const handleCreateDeck = () => {
    setSelectorVisible(false);
    setCreateDeckModalOpen(true);
  };

  const handleCreateDeckClose = (newDeck?: FlashcardDeck) => {
    setCreateDeckModalOpen(false);
    // 如果创建了新卡组，自动选择它并关闭所有弹窗
    if (newDeck) {
      onSelect(newDeck);
      onCancel();
    } else {
      // 否则重新显示选择卡组弹窗
      setSelectorVisible(true);
      fetchDecks();
    }
  };

  return (
    <>
      {selectorVisible && (
        <CustomModal
          open={open}
          onCancel={onCancel}
          width="500px"
          centered
          footer={null}
          title={title}
          subtitle={subtitle}
          icon={<Layers className="h-5 w-5 text-[var(--th-active-text)]" />}
        >
          <div className="space-y-3">
            <button
              onClick={handleCreateDeck}
              className={`w-full rounded-xl border-2 border-dashed p-4 text-left transition-all ${themeColors.borderClass} ${themeColors.hoverBorderClass} ${themeColors.hoverClass}`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${themeColors.tagBgClass}`}
                >
                  <Plus className={`h-5 w-5 ${themeColors.activeTextClass}`} />
                </div>
                <div className="flex-1">
                  <h4 className={`font-medium ${themeColors.activeTextClass}`}>创建新卡组</h4>
                  <p className={`text-sm ${themeColors.secondaryTextClass}`}>
                    为闪卡创建一个新的卡组
                  </p>
                </div>
              </div>
            </button>

            <div className="max-h-[400px] space-y-2 overflow-auto">
              {loadingDecks && (
                <div className={`py-8 text-center ${themeColors.secondaryTextClass}`}>
                  加载中...
                </div>
              )}

              {!loadingDecks && decks.length === 0 && (
                <div className="py-8 text-center">
                  <Layers
                    className={`mx-auto mb-3 h-12 w-12 ${themeColors.secondaryTextClass} opacity-50`}
                  />
                  <p className={`${themeColors.secondaryTextClass} mb-2`}>还没有任何卡组</p>
                  <p className={`text-sm ${themeColors.secondaryTextClass} opacity-70`}>
                    点击上方按钮创建第一个卡组
                  </p>
                </div>
              )}

              {!loadingDecks &&
                decks.map(deck => (
                  <button
                    key={deck.id}
                    onClick={() => handleSelect(deck)}
                    className={`w-full rounded-xl border p-4 text-left transition-all ${themeColors.cardBorderClass} ${themeColors.hoverBorderClass} ${themeColors.hoverClass}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{deck.emoji || "📚"}</span>
                      <div className="min-w-0 flex-1">
                        <h4 className={`truncate font-medium ${themeColors.activeTextClass}`}>
                          {deck.name}
                        </h4>
                        {deck.description && (
                          <p className={`truncate text-sm ${themeColors.textClass}`}>
                            {deck.description}
                          </p>
                        )}
                      </div>
                      <div className={`text-xs ${themeColors.secondaryTextClass}`}>
                        {deck.stats?.totalCards || 0} 张卡
                      </div>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </CustomModal>
      )}

      {/* 创建卡组模态框 */}
      <DeckFormModal
        state={{
          open: createDeckModalOpen,
          mode: "create",
        }}
        onClose={handleCreateDeckClose}
        themeColors={themeColors}
      />
    </>
  );
};

export default DeckSelectorModal;
