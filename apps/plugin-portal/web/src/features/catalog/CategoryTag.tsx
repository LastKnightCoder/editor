import { Tag, type TagColor } from "@tau/ui";
import { PLUGIN_CATEGORIES, type PluginCategory } from "@tau/plugins/package";

/** 相近分类共用色相：存储类蓝、写作产出类绿、语音与视频同色；锈红与赭黄不在 Tag 色板内，用 tag 色覆盖底与字。 */
const TONES: Record<PluginCategory, { color: TagColor; className?: string }> = {
  sync: { color: "blue" },
  upload: { color: "blue" },
  editor: { color: "green" },
  "blog-template": { color: "green" },
  "blog-publish": { color: "green" },
  whiteboard: { color: "purple" },
  ai: { color: "orange" },
  voice: { color: "purple", className: "bg-tag-5-soft text-tag-5" },
  video: { color: "purple", className: "bg-tag-5-soft text-tag-5" },
  page: { color: "purple", className: "bg-tag-4-soft text-tag-4" },
};
const LABELS = new Map<string, string>(PLUGIN_CATEGORIES.map(item => [item.id, item.label]));

export function CategoryTag({ category }: { category: PluginCategory }) {
  const tone = TONES[category] ?? { color: "gray" as const };
  return (
    <Tag color={tone.color} showDot={false} className={tone.className}>
      {LABELS.get(category) ?? category}
    </Tag>
  );
}

/** 卡片上的分类列表；未填写时不渲染 */
export function CategoryTags({
  categories,
}: {
  categories: readonly PluginCategory[] | undefined;
}) {
  if (!categories?.length) return null;
  return (
    <ul aria-label="分类" className="flex flex-wrap gap-1.5">
      {categories.map(category => (
        <li key={category} className="flex">
          <CategoryTag category={category} />
        </li>
      ))}
    </ul>
  );
}
