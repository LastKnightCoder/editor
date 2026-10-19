import { useState } from "react";
import { Eye } from "lucide-react";
import { Tabs } from "@tau/ui";
import type { PackageContent, Upload } from "../../../../contracts";
import { Markdown } from "../../components/markdown/Markdown";
import { PackageFacts } from "./PackageFacts";

type PreviewTab = "readme" | "changelog" | "files";

/** 包内 README / CHANGELOG / 文件清单，插件中心会原样展示前两者 */
export function PackagePreview({
  content,
  upload = null,
}: {
  content: PackageContent;
  upload?: Upload | null;
}) {
  const [tab, setTab] = useState<PreviewTab>("readme");
  const files = Object.keys(content.manifest.integrity).length;
  const items = [
    { key: "readme" as const, label: "介绍", children: <Markdown source={content.readme} /> },
    ...(content.changelog
      ? [
          {
            key: "changelog" as const,
            label: "更新说明",
            children: <Markdown source={content.changelog} />,
          },
        ]
      : []),
    {
      key: "files" as const,
      label: (
        <>
          文件<span className="text-tau-micro text-ink-3 font-normal">{files}</span>
        </>
      ),
      children: <PackageFacts manifest={content.manifest} upload={upload} />,
    },
  ];
  return (
    <section aria-label="插件包内容" className="relative">
      <span className="text-tau-micro text-ink-3 absolute right-1 top-2.5 inline-flex items-center gap-1">
        <Eye size={13} />
        插件中心会原样展示
      </span>
      <Tabs items={items} activeKey={tab} onChange={setTab} />
    </section>
  );
}
