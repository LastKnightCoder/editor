import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { FlashcardDeck } from "@/types";
import useFlashcardStore from "@/stores/useFlashcardStore";
import { flashcardDeckColors, flashcardDeckEmojis } from "@/utils/flashcard";

interface DeckFormModalProps {
  state: {
    open: boolean;
    mode: "create" | "edit";
    deck?: FlashcardDeck | null;
  };
  onClose: () => void;
  isDark: boolean;
}

const DeckFormModal = ({ state, onClose, isDark }: DeckFormModalProps) => {
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
        await createDeck({
          name: form.name.trim(),
          description: form.description.trim(),
          coverColor: form.coverColor,
          emoji: form.emoji,
        });
      } else if (state.deck) {
        await updateDeck({
          id: state.deck.id,
          name: form.name.trim(),
          description: form.description.trim(),
          coverColor: form.coverColor,
          emoji: form.emoji,
        });
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const surfaceClass = isDark
    ? "bg-slate-900/90 border-white/5 text-white"
    : "bg-white border-slate-200 text-slate-900";
  const inputClass = isDark
    ? "border border-white/15 bg-white/5 text-white placeholder:text-slate-400"
    : "border border-slate-300 bg-white text-slate-900 placeholder:text-slate-500";
  const labelClass = isDark ? "text-slate-300" : "text-slate-600";

  return (
    <AnimatePresence>
      {state.open && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !submitting && onClose()}
          />
          <motion.form
            onSubmit={handleSubmit}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            className={`relative w-full max-w-lg rounded-3xl border p-8 shadow-2xl ${surfaceClass}`}
          >
            <h3 className="text-xl font-semibold">
              {state.mode === "create" ? "新建卡组" : "编辑卡组"}
            </h3>
            <p
              className={`text-sm mt-1 ${
                isDark ? "text-slate-400" : "text-slate-500"
              }`}
            >
              设定卡组的标题、封面与简介
            </p>
            <div className="mt-6 space-y-4">
              <div>
                <label className={`block text-sm mb-2 ${labelClass}`}>
                  卡组名称
                </label>
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className={`w-full rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-400 ${inputClass}`}
                  placeholder="例如：算法复习"
                />
              </div>
              <div>
                <label className={`block text-sm mb-2 ${labelClass}`}>
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
                  className={`w-full rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-400 ${inputClass}`}
                  placeholder="为卡组添加一句简介或学习目标"
                />
              </div>
              <div>
                <label className={`block text-sm mb-2 ${labelClass}`}>
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
                      className={`w-10 h-10 rounded-full border-2 ${
                        form.coverColor === color
                          ? isDark
                            ? "border-white"
                            : "border-slate-900"
                          : "border-transparent opacity-70"
                      }`}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className={`block text-sm mb-2 ${labelClass}`}>
                  封面图标
                </label>
                <div className="flex flex-wrap gap-2">
                  {flashcardDeckEmojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={`w-10 h-10 rounded-full border text-lg ${
                        form.emoji === emoji
                          ? isDark
                            ? "border-white bg-white/10"
                            : "border-slate-900 bg-slate-100"
                          : isDark
                            ? "border-transparent bg-white/5"
                            : "border-slate-200 bg-white"
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
                onClick={onClose}
                disabled={submitting}
                className={`h-10 px-5 rounded-full border text-sm font-medium disabled:opacity-50 ${
                  isDark
                    ? "border-white/20 text-white hover:bg-white/10"
                    : "border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={!form.name.trim() || submitting}
                className="h-10 px-6 rounded-full bg-linear-to-r from-emerald-400 to-cyan-500 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 disabled:opacity-50"
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
