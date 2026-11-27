import { getEditorText } from "@/utils";
import { Descendant } from "slate";
import { DocumentCard } from "@tau/ui";
import { ProjectItem } from "@/types";
import useProjectWebLinkMeta from "@/hooks/useProjectWebLinkMeta";

import { useItemCardI18n } from "./i18n";

interface ItemCardProps {
  item: Partial<ProjectItem> & {
    content: Descendant[];
  };
  onClick: () => void;
}

const ItemCard = (props: ItemCardProps) => {
  const { item, onClick } = props;

  const { title } = useProjectWebLinkMeta(item);
  const displayTitle = title || item.title || "";
  const desc = getEditorText(item.content, 80);

  return <ItemCardFace title={displayTitle} description={desc} onClick={onClick} />;
};

function ItemCardFace({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  const { t } = useItemCardI18n();
  return (
    <DocumentCard title={title || t("untitled")} description={description} onClick={onClick} />
  );
}

export default ItemCard;
