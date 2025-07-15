import Editor, { EditorRef } from "@editor/index.tsx";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { Descendant } from "slate";
import AddTag from "@/components/AddTag";
import { memo, useEffect, useRef } from "react";
import { Button } from "antd";
import PortalToBody from "@/components/PortalToBody";
import useTheme from "@/hooks/useTheme";
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

  const [content, setContent] = useLocalStorageState<Descendant[]>(
    "card-edit-content",
    {
      defaultValue: DEFAULT_CARD_CONTENT,
    },
  );
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
    setTags((tags || []).filter((t) => t !== tag));
  };

  const onSaveCard = useMemoizedFn(
    async (content: Descendant[], tags: string[]) => {
      await onSave(content, tags);
      setContent(DEFAULT_CARD_CONTENT);
      setTags([]);
      editorRef.current?.setEditorValue(DEFAULT_CARD_CONTENT);
    },
  );

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

  if (!visible) {
    return null;
  }

  return (
    <PortalToBody>
      <div
        className="fixed inset-0 w-full h-full flex items-center justify-center z-[1000] bg-black/40 backdrop-blur-sm p-5"
        onClick={handleOverlayClick}
      >
        <div
          className={`relative w-4/5 max-w-[720px] min-h-[400px] max-h-[90vh] rounded-xl p-5 animate-[fadeIn_0.3s_ease] overflow-auto flex flex-col ${
            isDark
              ? "bg-[rgba(30,30,30,0.7)] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] border border-[rgba(86,84,84,0.5)]"
              : "bg-white backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.1)]"
          }`}
        >
          <div
            className={`flex-1 p-5 rounded-lg flex flex-col ${className || ""}`}
          >
            <div className="flex-1 min-h-[250px] rounded-md overflow-hidden">
              <Editor
                className="p-5"
                ref={editorRef}
                initValue={content || DEFAULT_CARD_CONTENT}
                readonly={false}
                onChange={setContent}
              />
            </div>
            <div className="mt-3 flex justify-between items-center">
              <AddTag
                tags={tags || []}
                addTag={onAddTag}
                removeTag={onRemoveTag}
              />
              <div className="flex gap-2">
                <Button onClick={onCancelSaveCard}>取消</Button>
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSaveCard(content || DEFAULT_CARD_CONTENT, tags || []);
                  }}
                >
                  保存
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PortalToBody>
  );
});

export default CreateCard;
