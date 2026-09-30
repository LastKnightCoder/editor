import { useEffect, useState } from "react";
import { Layers, Plus } from "lucide-react";
import { Button, Dialog, DialogBody, Spinner } from "@tau/ui";
import { useFlashcardDecks } from "../../queries";
import type { FlashcardDeck } from "@/types";
import DeckFormModal from "./DeckFormModal";
import DeckIcon from "@/components/DeckIcon";

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
  const { decks, loading: loadingDecks, error, retry } = useFlashcardDecks(open);

  const [createDeckModalOpen, setCreateDeckModalOpen] = useState(false);
  const [selectorVisible, setSelectorVisible] = useState(true);

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
    }
  };

  return (
    <>
      {selectorVisible && (
        <Dialog
          open={open}
          onOpenChange={next => {
            if (!next) onCancel();
          }}
          title={title}
          icon={<Layers />}
          subtitle={subtitle}
          width={500}
        >
          <DialogBody>
            <div className="space-y-3">
              <button
                onClick={handleCreateDeck}
                className="border-line-2 text-ink-2 hover:border-ink-3/50 hover:bg-hover rounded-tau-md w-full border border-dashed p-4 text-left transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-accent-soft text-accent grid size-10 place-items-center rounded-full">
                    <Plus className="size-5" strokeWidth={1.75} />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-ink-1 text-tau-body font-medium">创建新卡组</h4>
                    <p className="text-ink-3 text-tau-sm">为闪卡创建一个新的卡组</p>
                  </div>
                </div>
              </button>

              <div className="max-h-[400px] space-y-2 overflow-y-auto">
                {error && (
                  <div role="alert" className="text-danger flex items-center gap-2 py-4">
                    <span>读取卡组失败</span>
                    <Button variant="ghost" onClick={() => void retry()}>
                      重试
                    </Button>
                  </div>
                )}
                {loadingDecks && (
                  <div className="text-ink-3 text-tau-body flex items-center justify-center gap-2 py-8">
                    <Spinner className="size-4" />
                    加载中...
                  </div>
                )}

                {!loadingDecks && !error && decks.length === 0 && (
                  <div className="py-8 text-center">
                    <Layers
                      className="text-ink-3 mx-auto mb-3 size-12 opacity-50"
                      strokeWidth={1.75}
                    />
                    <p className="text-ink-2 text-tau-body mb-2">还没有任何卡组</p>
                    <p className="text-ink-3/70 text-tau-sm">点击上方按钮创建第一个卡组</p>
                  </div>
                )}

                {!loadingDecks &&
                  !error &&
                  decks.map(deck => (
                    <button
                      key={deck.id}
                      onClick={() => handleSelect(deck)}
                      className="border-line-1 hover:border-ink-3/50 hover:bg-hover rounded-tau-md w-full border p-4 text-left transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <DeckIcon
                          emoji={deck.emoji}
                          className="text-ink-2 size-6 shrink-0 text-2xl"
                        />
                        <div className="min-w-0 flex-1">
                          <h4 className="text-ink-1 text-tau-body truncate font-medium">
                            {deck.name}
                          </h4>
                          {deck.description && (
                            <p className="text-ink-3 text-tau-sm truncate">{deck.description}</p>
                          )}
                        </div>
                        <div className="text-ink-3 text-tau-sm tabular-nums">
                          {deck.stats?.totalCards || 0} 张卡
                        </div>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          </DialogBody>
        </Dialog>
      )}

      {/* 创建卡组模态框 */}
      <DeckFormModal
        state={{
          open: createDeckModalOpen,
          mode: "create",
        }}
        onClose={handleCreateDeckClose}
      />
    </>
  );
};

export default DeckSelectorModal;
