import { app } from "electron";
import assert from "node:assert/strict";
import path from "node:path";
import { createHash } from "node:crypto";
import { validatePluginManifest } from "@tau/plugins/package";
import { configureWindowContext } from "../../src-electron/main/windows/context";
import { ContentExecutor } from "../../src-electron/main/services/content-execution";
import type { Descendant } from "slate";
import type { IndexContentResult } from "../../src-electron/main/modules/index-content-protocol";
import { readPluginFixtures } from "../../../../scripts/plugins/test-support/package-fixtures";

const directory = process.env.TAU_BACKEND_TEST_DIRECTORY!;
app.setPath("userData", path.join(directory, "profile"));
app.on("window-all-closed", () => undefined);
void app.whenReady().then(async () => {
  configureWindowContext({
    devServerUrl: "",
    rendererDist: directory,
    preload: path.join(directory, "unused.js"),
  });
  const executor = new ContentExecutor();
  try {
    const code = `
      if(typeof globalThis.process!=='undefined' || globalThis.electron) throw new Error('内容进程不得获得 Node 或业务桥');
      const sdk=require('@tau/plugins'); const language='isolated';
      module.exports.default=sdk.definePlugin({id:'example.isolated',name:'隔离内容',version:'1.0.0',
        editorExtensions:[sdk.defineEditorExtension({id:'example.isolated',elements:[sdk.defineEditorElement({type:'example.isolated',kind:'block',isVoid:true,render:()=>null})]})],
        editorCodecs:[{type:'example.isolated',fence:{language},serializer:{isBlock:true,toMarkdown:node=>'~~~'+language+'\\n'+node.content+'\\n~~~'}}],
        create(){throw new Error('内容任务不得激活插件')}
      });`;
    const artifact = {
      code,
      manifest: validatePluginManifest({
        id: "example.isolated",
        name: "隔离内容",
        version: "1.0.0",
        apiVersion: 1,
        formatVersion: 1,
        platform: "desktop",
        format: "cjs",
        main: "main.js",
        editor: true,
        integrity: { "main.js": createHash("sha256").update(code).digest("hex") },
      }),
    };
    const markdown = "~~~isolated\n第三方内容\n~~~";
    const nodes = await executor.execute<Descendant[]>(
      { operation: "parse", markdown },
      undefined,
      [artifact]
    );
    assert.equal(
      (
        await executor.execute<string>({ operation: "markdown", nodes }, undefined, [artifact])
      ).trim(),
      markdown
    );
    const result = await executor.execute<IndexContentResult>(
      {
        operation: "index",
        input: { raw: JSON.stringify(nodes), title: "标题", whole: true, sections: true },
      },
      undefined,
      [artifact]
    );
    assert.equal(result.content, markdown);
    assert.ok(result.sections?.length);
    const search = await executor.execute<import("@tau/plugins/publish-data").SearchFile>(
      {
        operation: "publish-search",
        input: {
          cards: [
            { id: 1, aiTitle: "标题", content: nodes, tags: [] },
          ] as import("../../src-electron/main/modules/publish-search-index").BuildPublishSearchIndexInput["cards"],
          articles: [],
          docs: [],
          quests: [],
        },
      },
      undefined,
      [artifact]
    );
    assert.deepEqual(search, {
      version: 1,
      documents: [
        {
          key: "card:1",
          type: "card",
          id: 1,
          title: "标题",
          summary: "第三方内容",
          content: "第三方内容",
          tags: [],
        },
      ],
    });
    await assert.rejects(
      executor.execute({ operation: "markdown", nodes }, undefined, [artifact, artifact])
    );
    assert.equal(
      (
        await executor.execute<string>({ operation: "markdown", nodes }, undefined, [artifact])
      ).trim(),
      markdown
    );
    console.log("[plugin-content] 无 Node/业务桥、无激活、闭包 codec 往返、索引分段与失败恢复通过");
    const fixtures = (await readPluginFixtures(process.env.TAU_PLUGIN_FIXTURE_CATALOG!)).filter(
      artifact => artifact.manifest.editor || artifact.manifest.whiteboard
    );
    await executor.execute({ operation: "validate" }, undefined, fixtures);
    for (const [language, type] of [
      ["abc", "abc"],
      ["tikz", "tikz"],
      ["typst", "typst"],
      ["custom-block", "custom-block"],
      ["html", "html-block"],
    ]) {
      const marker = `content-check-${language}`;
      const source =
        language === "html" ? `<div>${marker}</div>` : `\`\`\`${language}\n${marker}\n\`\`\``;
      const parsed = await executor.execute<Descendant[]>(
        { operation: "parse", markdown: source },
        undefined,
        fixtures
      );
      assert.equal((parsed[0] as { type?: string }).type, type);
      const serialized = await executor.execute<string>(
        { operation: "markdown", nodes: parsed },
        undefined,
        fixtures
      );
      assert.ok(serialized.includes(marker));
      const restored = await executor.execute<Descendant[]>(
        { operation: "parse", markdown: serialized },
        undefined,
        fixtures
      );
      assert.equal(
        await executor.execute<string>(
          { operation: "markdown", nodes: restored },
          undefined,
          fixtures
        ),
        serialized
      );
    }
    console.log(
      `[plugin-content] ${fixtures.length} 个真实内容包校验及 HTML/ABC/TikZ/Typst/custom-block 往返通过`
    );
    executor.dispose();
    app.exit(0);
  } catch (error) {
    console.error(error);
    executor.dispose();
    app.exit(1);
  }
});
