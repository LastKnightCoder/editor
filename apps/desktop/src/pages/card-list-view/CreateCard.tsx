import { Editor, EditorRef } from "@tau/editor/src";
import { getDesktopKit } from "@/services/editorKit";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { Descendant } from "slate";
import AddTag from "@/components/AddTag";
import { memo, useEffect, useRef } from "react";
import { App } from "antd";
import { motion, AnimatePresence } from "motion/react";
import PortalToBody from "@/components/PortalToBody";
import useTheme from "@/hooks/useTheme";
import useThemeColors from "@/hooks/useThemeColors";
import classNames from "classnames";
import { DEFAULT_CARD_CONTENT } from "@/constants";

interface CreateCardProps {
  className?: string;
  onSave: (content: Descendant[], tags: string[]) => Promise<void>;
  onCancel: () => void;
  visible: boolean;
}

const CreateCard = memo((props: CreateCardProps) => {
  const { className, onSave, onCancel, visible } = props;
  const editorRef = useRef<EditorRef>(null);
  const { isDark } = useTheme();
  const themeColors = useThemeColors();
  const { message } = App.useApp();

  const [content, setContent] = useLocalStorageState<Descendant[]>("card-edit-content", {
    defaultValue: DEFAULT_CARD_CONTENT,
  });
  const [tags, setTags] = useLocalStorageState<string[]>("card-edit-tags", {
    defaultValue: [],
  });

  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        editorRef.current?.focus();
      }, 100);
    }
  }, [visible]);

  const onAddTag = (tag: string) => {
    setTags([...new Set([...(tags || []), tag])]);
  };

  const onRemoveTag = (tag: string) => {
    setTags((tags || []).filter(t => t !== tag));
  };

  const onEditTag = (oldTag: string, newTag: string) => {
    if (!newTag || newTag === oldTag) return;
    const currentTags = tags || [];
    if (currentTags.includes(newTag)) {
      message.warning("标签已存在");
      return;
    }
    setTags(currentTags.map(tag => (tag === oldTag ? newTag : tag)));
  };

  const onSaveCard = useMemoizedFn(async (content: Descendant[], tags: string[]) => {
    await onSave(content, tags);
    setContent(DEFAULT_CARD_CONTENT);
    setTags([]);
    editorRef.current?.setEditorValue(DEFAULT_CARD_CONTENT);
  });

  const onCancelSaveCard = () => {
    setContent(DEFAULT_CARD_CONTENT);
    setTags([]);
    editorRef.current?.setEditorValue(DEFAULT_CARD_CONTENT);
    onCancel();
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancelSaveCard();
    }
  };

  return (
    <PortalToBody>
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[1000] flex h-full w-full items-center justify-center bg-black/40 p-5 backdrop-blur-sm"
            onClick={handleOverlayClick}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className={`relative flex max-h-[90vh] min-h-[400px] w-4/5 max-w-[720px] flex-col overflow-auto rounded-xl p-5 ${
                isDark
                  ? "border border-[rgba(86,84,84,0.5)] bg-[rgba(30,30,30,0.7)] shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-xl"
                  : "bg-white shadow-[0_8px_32px_rgba(0,0,0,0.1)] backdrop-blur-xl"
              }`}
            >
              <div className={`flex flex-1 flex-col rounded-lg p-5 ${className || ""}`}>
                <div className="min-h-[250px] flex-1 overflow-hidden rounded-md">
                  <Editor
                    kit={getDesktopKit()}
                    className="p-5"
                    ref={editorRef}
                    initValue={content || DEFAULT_CARD_CONTENT}
                    readonly={false}
                    onChange={setContent}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <AddTag
                    tags={tags || []}
                    addTag={onAddTag}
                    removeTag={onRemoveTag}
                    editTag={onEditTag}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={onCancelSaveCard}
                      className="cursor-pointer rounded-xl border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-200 dark:border-slate-700 dark:bg-zinc-800 dark:text-slate-300 dark:hover:bg-zinc-700"
                    >
                      取消
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onSaveCard(content || DEFAULT_CARD_CONTENT, tags || []);
                      }}
                      className={classNames(
                        "cursor-pointer rounded-xl border-none px-5 py-2 text-sm font-semibold shadow-[0_4px_14px_rgba(0,0,0,0.2),0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:-translate-y-px active:translate-y-0",
                        themeColors.buttonBg,
                        themeColors.buttonTextClass
                      )}
                    >
                      保存
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PortalToBody>
  );
});

export default CreateCard;
