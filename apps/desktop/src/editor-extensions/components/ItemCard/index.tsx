import { getEditorText } from "@/utils";
import { Descendant } from "slate";
import { DocumentCard } from "@tau/ui";
import { ProjectItem } from "@/types";
import useProjectWebLinkMeta from "@/hooks/useProjectWebLinkMeta";

interface ItemCardProps {
  item: Partial<ProjectItem> & {
    content: Descendant[];
  };
  onClick: () => void;
}

const ItemCard = (props: ItemCardProps) => {
  const { item, onClick } = props;

  const { title } = useProjectWebLinkMeta(item);
  const displayTitle = title || item.title || "未命名文档";
  const desc = getEditorText(item.content, 80);

  return <DocumentCard title={displayTitle} description={desc} onClick={onClick} />;
};

export default ItemCard;
