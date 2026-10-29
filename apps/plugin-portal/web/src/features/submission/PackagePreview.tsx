import { useState } from "react";
import { Eye } from "lucide-react";
import { Tabs } from "@tau/ui";
import type { PackageContent, Upload } from "../../../../contracts";
import { Markdown } from "../../components/markdown/Markdown";
import { hasSkillScripts } from "@tau/plugins/template";
import { TargetMatrix } from "../catalog/TargetMatrix";
import { PackageFacts } from "./PackageFacts";

type PreviewTab = "readme" | "changelog" | "platforms" | "files";

/** 与审核闸门同一口径列出需要核对的 Skill 脚本文件 */
function skillScripts(manifest: PackageContent["manifest"]) {
  if (!("skills" in manifest) || !manifest.skills?.length) return [];
  return Object.keys(manifest.integrity).filter(file =>
    hasSkillScripts({ skills: manifest.skills, integrity: { [file]: manifest.integrity[file] } })
  );
}

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
  const backend = "backend" in content.manifest ? content.manifest.backend : undefined;
  const scripts = skillScripts(content.manifest);
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
    ...(content.manifest.platform === "portable"
      ? [
          {
            key: "platforms" as const,
            label: "平台",
            children: (
              <div className="flex flex-col gap-3">
                <p className="text-tau-sm text-ink-3">
                  平台声明来自包内
                  manifest，只读；需要增删平台或调整最低版本、能力与节点等级，请修改后重新打包上传。
                </p>
                <TargetMatrix targets={content.manifest.targets} />
              </div>
            ),
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
      <span className="text-tau-micro text-ink-3 absolute top-2.5 right-1 inline-flex items-center gap-1">
        <Eye size={13} />
        插件中心会原样展示
      </span>
      <Tabs items={items} activeKey={tab} onChange={setTab} />
      {backend && (
        <aside
          aria-label="系统能力声明"
          className="border-warn bg-warn-soft text-ink-1 text-tau-sm rounded-tau-md mt-4 space-y-2 border p-4"
        >
          <h3 className="font-semibold">包含本机后台代码 · 需要系统能力重点审核</h3>
          <p>{backend.reason}</p>
          <p>
            入口：{backend.entry} · 范围：{backend.scope} · 启动：{backend.activation} · 运行：
            {backend.lifetime}
          </p>
          <p>系统用途：{backend.systemAccess.join("、") || "系统信息与计算"}</p>
          {backend.tools?.map(tool => (
            <p key={tool.id}>
              外部程序 {tool.id}：{tool.command} {tool.args?.join(" ")}
            </p>
          ))}
          <p>独立进程不等于系统权限沙箱；请核对本修订的源码、完整产物和包摘要。</p>
        </aside>
      )}
      {scripts.length > 0 && (
        <aside
          aria-label="Skill 脚本"
          className="border-warn bg-warn-soft text-ink-1 text-tau-sm rounded-tau-md mt-4 space-y-2 border p-4"
        >
          <h3 className="font-semibold">Skill 附带脚本 · 需要系统能力重点审核</h3>
          <p>AI 助手经用户确认后可在用户本机执行这些脚本，执行时没有系统权限沙箱。</p>
          {scripts.map(file => (
            <p key={file} className="font-mono">
              {file}
            </p>
          ))}
        </aside>
      )}
    </section>
  );
}
