#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { userDocs } from "../apps/website/src/docs/manifest.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const docsContentDir = path.join(rootDir, "apps/website/content/docs");
const outputDir = path.join(rootDir, "packages/ai/src/skills/internal");
const indexOutputPath = path.join(outputDir, "user-docs.generated.ts");
const resourcesOutputPath = path.join(outputDir, "user-docs-resources.generated.ts");

const SITE_ORIGIN = "https://taunote.app";
const DEMO_LINE = /^::demo\{[^}]*\}\s*$/;
const CALLOUT_OPEN = /^:::(tip|info|warning|detail)(?:\{([^}]*)\})?\s*$/;
const CALLOUT_CLOSE = /^:::\s*$/;
const ATTR = /(\w+)="([^"]*)"/g;

const CALLOUT_LABELS = {
  tip: "提示",
  info: "说明",
  warning: "注意",
  detail: "补充",
};

function parseAttrs(source) {
  if (!source) return {};
  return Object.fromEntries(Array.from(source.matchAll(ATTR), match => [match[1], match[2]]));
}

export function docResourcePath(slug) {
  return `references/${slug || "index"}.md`;
}

function rewriteInternalLinks(line, validSlugs) {
  return line.replace(/\]\(\/([^)\s]*)\)/g, (full, rawTarget) => {
    if (rawTarget === "docs" || rawTarget === "docs/") {
      return `](${docResourcePath("")})`;
    }
    if (rawTarget.startsWith("docs/")) {
      const rest = rawTarget.slice("docs/".length);
      const hashIndex = rest.indexOf("#");
      const rawSlug = (hashIndex >= 0 ? rest.slice(0, hashIndex) : rest).replace(/\/$/, "");
      const hash = hashIndex >= 0 ? rest.slice(hashIndex) : "";
      if (validSlugs.has(rawSlug)) {
        return `](${docResourcePath(rawSlug)}${hash})`;
      }
    }
    if (rawTarget.startsWith("docs#")) {
      return `](${docResourcePath("")}${rawTarget.slice("docs".length)})`;
    }
    return `](${SITE_ORIGIN}/${rawTarget})`;
  });
}

export function cleanUserDocMarkdown(markdown, entry, validSlugs) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let inFence = false;
  let openCallouts = 0;

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    if (DEMO_LINE.test(line)) {
      continue;
    }
    const openMatch = CALLOUT_OPEN.exec(line);
    if (openMatch) {
      openCallouts++;
      const label = CALLOUT_LABELS[openMatch[1]];
      const { title } = parseAttrs(openMatch[2]);
      out.push(title ? `**${label}：${title}**` : `**${label}**`);
      out.push("");
      continue;
    }
    if (openCallouts > 0 && CALLOUT_CLOSE.test(line)) {
      openCallouts--;
      out.push("");
      continue;
    }
    out.push(rewriteInternalLinks(line, validSlugs));
  }

  const body = out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return `# ${entry.title}\n\n${body}\n`;
}

export function buildUserDocsSkillArtifacts() {
  const validSlugs = new Set(userDocs.all.map(entry => entry.slug));
  const resources = {};
  const resourcePaths = [];

  for (const entry of userDocs.all) {
    const fileName = `${entry.slug || "index"}.md`;
    const sourcePath = path.join(docsContentDir, fileName);
    if (!existsSync(sourcePath)) {
      throw new Error(`缺少使用文档正文：${sourcePath}`);
    }
    const raw = readFileSync(sourcePath, "utf8");
    const resourcePath = docResourcePath(entry.slug);
    resources[resourcePath] = cleanUserDocMarkdown(raw, entry, validSlugs);
    resourcePaths.push(resourcePath);
  }

  const tocLines = [
    "# Tau 使用文档",
    "",
    "本 Skill 内置当前版本的 Tau 官方使用文档。回答用户关于 Tau 怎么用、功能入口、界面操作、快捷键、配置、同步、协作、发布、插件、手机端或故障排查的问题时，先从下方目录挑选 1～2 篇最相关的文档，再按相对路径读取对应的 `references/<slug>.md` 文件（如调用 `read_skill_file` 或 `read_skill_resource`）。",
    "",
    "## 使用原则",
    "",
    "- 仅在用户询问 Tau 本身的使用方法或排查问题时使用；若用户询问自己记录的笔记与知识库内容，不要调用本 Skill。",
    "- 按需读取最相关的 1～2 篇；如文中链接到其他 `references/*.md` 且确有必要，再继续读取，避免一次读完所有文件。",
    "- 严格依据已读文档回答，不编造不存在的菜单、按钮、设置项或快捷键；涉及电脑端与手机端差异时明确说明。",
    "- 文档未涵盖或涉及最新下载/版本动态时如实告知用户。",
    "",
    "## 文档目录",
  ];

  const hiddenEntries = [];
  for (const group of userDocs.groups) {
    const visible = group.items.filter(item => {
      if (item.hidden) {
        hiddenEntries.push(item);
        return false;
      }
      return true;
    });
    if (!visible.length) continue;
    tocLines.push("", `### ${group.title}`, "");
    for (const item of visible) {
      tocLines.push(`- [${item.title}](${docResourcePath(item.slug)})：${item.summary}`);
    }
  }

  if (hiddenEntries.length > 0) {
    tocLines.push("", "### 附录", "");
    for (const item of hiddenEntries) {
      tocLines.push(`- [${item.title}](${docResourcePath(item.slug)})：${item.summary}`);
    }
  }

  const readme = `${tocLines.join("\n")}\n`;
  const banner =
    "// 由 scripts/build-user-docs-skill.mjs 从 apps/website/content/docs/ 自动生成，请勿手工修改。\n";

  const indexSource =
    banner +
    `\nexport const USER_DOCS_SKILL_README =\n  ${JSON.stringify(readme)};\n\n` +
    `export const USER_DOCS_SKILL_RESOURCE_PATHS: readonly string[] = [\n` +
    resourcePaths.map(item => `  ${JSON.stringify(item)},`).join("\n") +
    `\n];\n\n` +
    `let resourceCache: Promise<Readonly<Record<string, string>>> | undefined;\n\n` +
    `export async function loadUserDocsSkillResource(relativePath: string): Promise<string | undefined> {\n` +
    `  resourceCache ??= import("./user-docs-resources.generated").then(\n` +
    `    module => module.USER_DOCS_SKILL_RESOURCES\n` +
    `  );\n` +
    `  const resources = await resourceCache;\n` +
    `  return Object.prototype.hasOwnProperty.call(resources, relativePath)\n` +
    `    ? resources[relativePath]\n` +
    `    : undefined;\n` +
    `}\n`;

  const resourcesSource =
    banner +
    `\nexport const USER_DOCS_SKILL_RESOURCES: Readonly<Record<string, string>> = {\n` +
    resourcePaths
      .map(item => `  ${JSON.stringify(item)}:\n    ${JSON.stringify(resources[item])},`)
      .join("\n") +
    `\n};\n`;

  return {
    readme,
    resourcePaths,
    resources,
    files: [
      { path: indexOutputPath, content: indexSource },
      { path: resourcesOutputPath, content: resourcesSource },
    ],
  };
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const { files, resourcePaths } = buildUserDocsSkillArtifacts();

  if (checkOnly) {
    const stale = files.filter(
      file => !existsSync(file.path) || readFileSync(file.path, "utf8") !== file.content
    );
    if (stale.length > 0) {
      const list = stale.map(file => path.relative(rootDir, file.path)).join(", ");
      throw new Error(
        `内置使用文档 Skill 产物已过期（${list}），请运行 pnpm docs:skill:build 重新生成`
      );
    }
    console.log(`[user-docs-skill] OK docs=${resourcePaths.length}`);
    return;
  }

  for (const file of files) {
    if (!existsSync(file.path) || readFileSync(file.path, "utf8") !== file.content) {
      writeFileSync(file.path, file.content, "utf8");
    }
  }
  console.log(`[user-docs-skill] built docs=${resourcePaths.length}`);
}

const isEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntry) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
