import { DocumentCardGrid } from "@tau/ui";
import { useQuery } from "@tanstack/react-query";
import ItemCard from "@/editor-extensions/components/ItemCard";

import { getProjectItemsByIds, getProjectItemById } from "@/commands";
import { ProjectItem } from "@/types";
import { getProjectItemChildren } from "@/commands/project";
import type { ContentEntityReference } from "@tau/db-schema/content-identities";
import useSettingStore from "@/stores/useSettingStore";

import { useProjectCardListI18n } from "../../i18n";

interface IProps {
  projectItemId?: number;
  reference?: ContentEntityReference;
  onClick: (item: ProjectItem, index: number, reference?: ContentEntityReference) => void;
}

const ProjectList = (props: IProps) => {
  const { projectItemId, reference, onClick } = props;
  const database = useSettingStore(state => state.setting.database.active);
  const query = useQuery({
    queryKey: ["project-card-list", database, reference ?? projectItemId],
    enabled: Boolean(reference || projectItemId),
    refetchOnWindowFocus: true,
    retry: false,
    queryFn: async (): Promise<{ item: ProjectItem; reference?: ContentEntityReference }[]> => {
      if (reference) return getProjectItemChildren(reference);
      if (projectItemId == null) return [];
      const parent = await getProjectItemById(projectItemId);
      if (!parent) return [];
      const items = await getProjectItemsByIds(parent.children);
      return items
        .sort((a, b) => parent.children.indexOf(a.id) - parent.children.indexOf(b.id))
        .map(item => ({ item }));
    },
  });
  const items = query.data ?? [];
  if (query.error)
    return (
      <p contentEditable={false} role="status" className="text-ink-3 text-tau-sm py-6 text-center">
        <ProjectListStatus kind="source.unavailable" />
      </p>
    );

  if (items.length === 0) {
    return (
      <div contentEditable={false} style={{ userSelect: "none" }}>
        <p className="text-ink-3 py-6 text-center text-xs">
          <ProjectListStatus kind="empty" />
        </p>
      </div>
    );
  }

  return (
    <DocumentCardGrid>
      {items.map(({ item, reference }, i) => (
        <ItemCard key={item.id} item={item} onClick={() => onClick(item, i, reference)} />
      ))}
    </DocumentCardGrid>
  );
};

function ProjectListStatus({ kind }: { kind: "source.unavailable" | "empty" }) {
  const { t } = useProjectCardListI18n();
  return t(kind);
}

export default ProjectList;
