import {
  PublishSiteGenerator,
  type PublishDataSource,
} from "../../src-electron/main/modules/publish-site-generator";
import { readPublishPlugins } from "../../src-electron/main/services/plugin-publish";
import { readPluginPackage } from "../../src-electron/main/services/plugin-package";
import path from "node:path";
import type { IArticle } from "../../src/types/article";
import { customSource } from "./custom-fixture";
import { desktopContentPlugins } from "../../shared/content-plugins.ts";
import { sharedPluginModules } from "@tau/plugins/shared-modules";
import { buildPublishSearchIndexPayload } from "../../src-electron/main/modules/publish-search-index";
import { readTemplatePackage } from "../../src-electron/main/services/template-package";

/** 验证只替换数据库数据源，包读取、依赖固定、页面生成走正式代码。 */
export async function generateFixture(
  templateDir: string,
  directory: string,
  missing = false,
  compileTailwind: (code: string, extension: "tsx" | "html") => Promise<string> = async () => ""
) {
  const artifact = await readPluginPackage(path.join(directory, "example.portable-counter"));
  const custom = await readPluginPackage(path.join(directory, "tau.custom-block"));
  desktopContentPlugins.load([artifact, custom], sharedPluginModules);
  const plugins = await readPublishPlugins(directory, {
    builtinTypes: ["paragraph"],
    plugins: missing
      ? []
      : [
          {
            id: artifact.manifest.id,
            version: artifact.manifest.version,
            mainHash: artifact.manifest.integrity[artifact.manifest.main],
            stylesHash: artifact.manifest.styles
              ? artifact.manifest.integrity[artifact.manifest.styles]
              : undefined,
            nodeTypes: ["example.portable-counter"],
          },
          {
            id: custom.manifest.id,
            version: custom.manifest.version,
            mainHash: custom.manifest.integrity[custom.manifest.main],
            stylesHash: custom.manifest.integrity[custom.manifest.styles!],
            nodeTypes: ["custom-block"],
            styleSources: [{ type: "custom-block", field: "content", language: "tsx" }],
          },
        ],
  });
  const article = {
    id: 1,
    contentId: 1,
    title: "正式插件发布验收",
    author: "Tau",
    tags: [],
    links: [],
    bannerBg: "",
    isTop: false,
    isDelete: false,
    count: 1,
    create_time: 1,
    update_time: 1,
    content: [
      { type: "paragraph", children: [{ type: "formatted", text: "正文" }] },
      { type: "example.portable-counter", initial: 7, children: [{ type: "formatted", text: "" }] },
      { type: "custom-block", content: customSource, children: [{ type: "formatted", text: "" }] },
      { type: "paragraph", children: [{ type: "formatted", text: "结尾" }] },
    ],
  } as unknown as IArticle;
  const data: PublishDataSource = {
    getCardByIds: () => [],
    getCardById: () => null,
    getContentLinkTargetContentIds: () => [],
    getArticleByIds: () => [article],
    getProject: () => {
      throw new Error("此夹具不包含项目");
    },
    getProjectItemsByIds: () => [],
  };
  const generator = new PublishSiteGenerator({
    template: await readTemplatePackage(templateDir, "0.59.0"),
    buildSearchIndex: async input => buildPublishSearchIndexPayload(input),
    plugins,
    compileTailwind,
    logger: console,
  });
  return generator.generate(data, [{ contentType: "article", contentId: 1, parentPath: "" }], {
    title: "验收站点",
    description: "",
    basePath: "/",
  });
}
