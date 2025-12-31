import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { FlashcardDeck } from "@/types";
import useFlashcardStore from "@/stores/useFlashcardStore";
import { flashcardDeckColors, flashcardDeckEmojis } from "@/utils/flashcard";

interface ThemeColors {
  hoverClass: string;
  activeClass: string;
  borderClass: string;
  cardBgClass: string;
  cardBorderClass: string;
  tagBgClass: string;
  tagTextClass: string;
  textClass: string;
  secondaryTextClass: string;
  activeTextClass: string;
  activeBorderClass: string;
  activeBgClass: string;
  primaryButtonClass: string;
  inputBgClass: string;
  focusBorderClass: string;
  focusRingClass: string;
  glassPanelBg: string;
  [key: string]: string;
}

interface DeckFormModalProps {
  state: {
    open: boolean;
    mode: "create" | "edit";
    deck?: FlashcardDeck | null;
  };
  onClose: (newDeck?: FlashcardDeck) => void;
  themeColors: ThemeColors;
}

const DeckFormModal = ({ state, onClose, themeColors }: DeckFormModalProps) => {
  const createDeck = useFlashcardStore((store) => store.createDeck);
  const updateDeck = useFlashcardStore((store) => store.updateDeck);

  const [form, setForm] = useState({
    name: "",
    description: "",
    coverColor: flashcardDeckColors[0],
    emoji: flashcardDeckEmojis[0],
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    if (state.mode === "edit" && state.deck) {
      setForm({
        name: state.deck.name,
        description: state.deck.description ?? "",
        coverColor: state.deck.coverColor ?? flashcardDeckColors[0],
        emoji: state.deck.emoji ?? flashcardDeckEmojis[0],
      });
    } else {
      setForm({
        name: "",
        description: "",
        coverColor: flashcardDeckColors[0],
        emoji: flashcardDeckEmojis[0],
      });
    }
  }, [state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      if (state.mode === "create") {
        const newDeck = await createDeck({
          name: form.name.trim(),
          description: form.description.trim(),
          coverColor: form.coverColor,
          emoji: form.emoji,
        });
        onClose(newDeck);
      } else if (state.deck) {
        await updateDeck({
          id: state.deck.id,
          name: form.name.trim(),
          description: form.description.trim(),
          coverColor: form.coverColor,
          emoji: form.emoji,
        });
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {state.open && (
        <motion.div
          className="fixed inset-0 z-[150] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={(e) => {
              e.stopPropagation();
              !submitting && onClose();
            }}
          />
          <motion.form
            onSubmit={handleSubmit}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            className={`relative w-full max-w-lg rounded-3xl border p-8 shadow-2xl backdrop-blur-xl ${themeColors.glassPanelBg} ${themeColors.cardBorderClass}`}
          >
            <h3
              className={`text-xl font-semibold ${themeColors.activeTextClass}`}
            >
              {state.mode === "create" ? "新建卡组" : "编辑卡组"}
            </h3>
            <p className={`text-sm mt-1 ${themeColors.textClass}`}>
              设定卡组的标题、封面与简介
            </p>
            <div className="mt-6 space-y-4">
              <div>
                <label
                  className={`block text-sm mb-2 ${themeColors.textClass}`}
                >
                  卡组名称
                </label>
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className={`w-full rounded-xl px-4 py-3 focus:outline-none border ${themeColors.inputBgClass} ${themeColors.borderClass} ${themeColors.activeTextClass} ${themeColors.focusRingClass}`}
                  placeholder="例如：算法复习"
                />
              </div>
              <div>
                <label
                  className={`block text-sm mb-2 ${themeColors.textClass}`}
                >
                  描述
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  rows={3}
                  className={`w-full rounded-xl px-4 py-3 focus:outline-none border ${themeColors.inputBgClass} ${themeColors.borderClass} ${themeColors.activeTextClass} ${themeColors.focusRingClass}`}
                  placeholder="为卡组添加一句简介或学习目标"
                />
              </div>
              <div>
                <label
                  className={`block text-sm mb-2 ${themeColors.textClass}`}
                >
                  主题颜色
                </label>
                <div className="flex flex-wrap gap-2">
                  {flashcardDeckColors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({ ...prev, coverColor: color }))
                      }
                      style={{ backgroundColor: color }}
                      className={`w-10 h-10 rounded-full border-2 transition ${
                        form.coverColor === color
                          ? themeColors.activeBorderClass
                          : "border-transparent opacity-70"
                      }`}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label
                  className={`block text-sm mb-2 ${themeColors.textClass}`}
                >
                  封面图标
                </label>
                <div className="flex flex-wrap gap-2">
                  {flashcardDeckEmojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={`w-10 h-10 rounded-full border text-lg transition ${
                        form.emoji === emoji
                          ? `${themeColors.activeBorderClass} ${themeColors.activeClass}`
                          : `${themeColors.borderClass} ${themeColors.tagBgClass}`
                      }`}
                      onClick={() => setForm((prev) => ({ ...prev, emoji }))}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-8 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => onClose()}
                disabled={submitting}
                className={`h-10 px-5 rounded-full border text-sm font-medium disabled:opacity-50 ${themeColors.borderClass} ${themeColors.activeTextClass} ${themeColors.hoverClass}`}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={!form.name.trim() || submitting}
                className={`h-10 px-6 rounded-full text-sm font-semibold shadow-lg disabled:opacity-50 ${themeColors.primaryButtonClass}`}
              >
                {state.mode === "create" ? "创建卡组" : "保存修改"}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DeckFormModal;
