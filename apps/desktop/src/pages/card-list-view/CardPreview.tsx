import { useEffect, useRef } from "react";
import { useMemoizedFn, useCreation, useRafInterval, useUnmount } from "ahooks";
import { Button, Tooltip, App } from "antd";
import { Descendant } from "slate";
import { ExpandOutlined, CloseOutlined } from "@ant-design/icons";
import { EditorRef } from "@tau/editor/src";
import Editor from "@/components/ContentEditor";
import AddTag from "@/components/AddTag";
import ErrorBoundary from "@/components/ErrorBoundary";
import useEditCard from "@/pages/CardDetailView/useEditCard";
import useEditContent from "@/hooks/useEditContent";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import { formatDate, defaultCardEventBus } from "@/utils";
import CustomModal from "@/components/CustomModal";

interface CardPreviewProps {
  cardId: number | undefined;
  visible: boolean;
  onClose: () => void;
  onGoToDetail?: () => void;
}

const CardPreview = (props: CardPreviewProps) => {
  const { cardId, visible, onClose, onGoToDetail } = props;
  const dynamicExtensions = useDynamicExtensionsStore(state => state.extensions);
  const navigateTo = useTabStore(state => state.navigateTo);
  const editorRef = useRef<EditorRef>(null);
  const { message } = App.useApp();
  const cardEventBus = useCreation(() => defaultCardEventBus.createEditor(), []);
  const {
    initValue,
    loading,
    editingCard,
    onContentChange: onContentChangeFromEditCard,
    onAddTag,
    onDeleteTag,
    onTagChange,
    saveCard,
    prevCard,
    setEditingCard,
    onInit,
  } = useEditCard(cardId);

  const { throttleHandleEditorContentChange } = useEditContent(editingCard?.contentId, content => {
    editorRef.current?.setEditorValue(content);
  });

  useEffect(() => {
    if (visible && editingCard) {
      const unsubscribe = cardEventBus.subscribeToCardWithId(
        "card:updated",
        editingCard.id,
        data => {
          setEditingCard(data.card);
          prevCard.current = data.card;
        }
      );
      return () => {
        unsubscribe();
      };
    }
  }, [cardId, visible, cardEventBus, editingCard]);

  useRafInterval(async () => {
    if (editingCard) {
      const updatedCard = await saveCard();
      if (updatedCard) {
        cardEventBus.publishCardEvent("card:updated", updatedCard);
      }
    }
  }, 500);

  useUnmount(async () => {
    const updatedCard = await saveCard();
    if (updatedCard) {
      cardEventBus.publishCardEvent("card:updated", updatedCard);
    }
  });

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    throttleHandleEditorContentChange(content);
    onContentChangeFromEditCard(content);
  });

  const handleAddTag = useMemoizedFn((tag: string) => {
    if (!editingCard || editingCard.tags.includes(tag)) return;
    onAddTag(tag);
  });

  const handleDeleteTag = useMemoizedFn((tag: string) => {
    if (!editingCard || !editingCard.tags.includes(tag)) return;
    onDeleteTag(tag);
  });

  const handleEditTag = useMemoizedFn((oldTag: string, newTag: string) => {
    if (!editingCard || !newTag || newTag === oldTag) return;
    if (editingCard.tags.includes(newTag)) {
      message.warning("标签已存在");
      return;
    }
    // 直接替换标签，保持顺序
    const newTags = editingCard.tags.map(tag => (tag === oldTag ? newTag : tag));
    onTagChange(newTags);
  });

  const handleClose = useMemoizedFn(() => {
    onClose();
  });

  const handleGoToDetail = useMemoizedFn(() => {
    if (editingCard) {
      navigateTo(TabType.CardDetail, { id: editingCard.id }, `卡片详情 #${editingCard.id}`);
      onGoToDetail?.();
    }
  });

  const renderHeader = () => (
    <div className="flex w-full items-center justify-between">
      <div className="flex gap-2.5 text-xs text-gray-500">
        {editingCard && (
          <>
            <div>
              <span>创建于 {formatDate(editingCard.create_time, true)}</span>
            </div>
            <div>
              <span>最后修改于 {formatDate(editingCard.update_time, true)}</span>
            </div>
            <div>字数：{editingCard.count}</div>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Tooltip title="前往详情">
          <Button type="text" icon={<ExpandOutlined />} onClick={handleGoToDetail} />
        </Tooltip>
        <Tooltip title="关闭">
          <Button type="text" icon={<CloseOutlined />} onClick={handleClose} />
        </Tooltip>
      </div>
    </div>
  );

  return (
    <CustomModal
      title={renderHeader()}
      open={visible && !!cardId}
      onCancel={handleClose}
      footer={null}
      showCloseButton={false}
      width={800}
      destroyOnClose
      closeOnEscape={false}
      bodyClassName="px-6 pb-6 max-h-[70vh] overflow-auto"
    >
      {loading ? (
        <div className="h-75 text-(length:--font-size) flex items-center justify-center">
          加载中...
        </div>
      ) : (
        editingCard && (
          <div className="flex flex-col gap-3">
            <div className="min-h-50 text-(length:--font-size)">
              <ErrorBoundary>
                <Editor
                  contentId={editingCard?.contentId}
                  key={editingCard.id}
                  ref={editorRef}
                  onInit={onInit}
                  initValue={initValue}
                  onChange={onContentChange}
                  extensions={dynamicExtensions}
                  readonly={false}
                />
              </ErrorBoundary>
            </div>
            <div className="flex items-center">
              <AddTag
                tags={editingCard.tags}
                addTag={handleAddTag}
                removeTag={handleDeleteTag}
                editTag={handleEditTag}
              />
            </div>
          </div>
        )
      )}
    </CustomModal>
  );
};

export default CardPreview;
