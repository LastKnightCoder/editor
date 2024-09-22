import useEditCard from "./useEditCard.ts";
import { Skeleton } from "antd";
import Editor from '@/components/Editor';
import { useRafInterval, useUnmount } from "ahooks";
import useUploadImage from "@/hooks/useUploadImage.ts";
import { cardLinkExtension, fileAttachmentExtension } from "@/editor-extensions";

const customExtensions = [
  cardLinkExtension,
  fileAttachmentExtension
];

interface CardProps {
  cardId: number;
}

const Card = ({ cardId }: CardProps) => {
  const {
    loading,
    editingCard,
    saveCard,
    onContentChange
  } = useEditCard(cardId);

  useRafInterval(() => {
    saveCard();
  }, 3000)

  useUnmount(() => {
    saveCard();
  });

  const uploadImage = useUploadImage();

  if (loading) {
    return (
      <div style={{ width: '100%', height: '100%' }}>
        <Skeleton paragraph={{ rows: 4 }} />
      </div>
    )
  }

  if (!editingCard) return null;

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', boxSizing: 'border-box', border: '20px solid transparent', boxShadow: 'var(--box-shadow1)', backgroundColor: 'var(--normal-card-bg)' }}>
      <Editor
        key={cardId}
        initValue={editingCard.content}
        onChange={onContentChange}
        uploadImage={uploadImage}
        extensions={customExtensions}
        readonly={false}
      />
    </div>
  )
}

export default Card;
