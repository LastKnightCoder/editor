// @vitest-environment node
import { expect, it } from "vitest";
it.skipIf(!process.env.TAU_PLUGIN_UPGRADE_CASE || !process.env.TAU_LEGACY_LIBRARY_SNAPSHOT)(
  "正式更新的插件契约能够转换真实旧节点",
  async () => {
    const fs = await import("node:fs/promises"),
      { join, resolve } = await import("node:path");
    const { default: Database } = await import("better-sqlite3");
    const { convertLegacyContent } = await import("@tau/editor-collab");
    const root = process.env.TAU_PLUGIN_UPGRADE_CASE!,
      snapshot = resolve(process.env.TAU_LEGACY_LIBRARY_SNAPSHOT!);
    expect(snapshot.startsWith(resolve(process.env.HOME ?? "", ".editor") + "/")).toBe(false);
    expect(
      JSON.parse(await fs.readFile(join(root, "rehearsal-marker.json"), "utf8")).isolated
    ).toBe(true);
    const contracts = JSON.parse(await fs.readFile(join(root, "contracts.json"), "utf8"));
    const db = new Database(snapshot, { readonly: true, fileMustExist: true });
    const counts: Record<string, number> = {},
      converted: Record<string, number> = {},
      issues: Record<string, number> = {};
    const types = new Set([
      "abc",
      "custom-block",
      "html-block",
      "html-inline",
      "image-gallery",
      "tikz",
      "typst",
    ]);
    const nodes: import("@tau/collaboration").ContentNode[] = [];
    const visit = (items: import("@tau/collaboration").ContentNode[]) => {
      for (const node of items) {
        if (types.has(String(node.type))) nodes.push(node);
        if (Array.isArray(node.children)) visit(node.children);
      }
    };
    try {
      for (const row of db.prepare("SELECT content FROM contents").all() as { content: string }[])
        visit(JSON.parse(row.content));
    } finally {
      db.close();
    }
    for (const node of nodes) {
      const type = String(node.type);
      counts[type] = (counts[type] ?? 0) + 1;
      const result = await convertLegacyContent([node], contracts, {
        shared: false,
        resolveEntity: () => null,
      });
      if (result.content[0].type === node.type) converted[type] = (converted[type] ?? 0) + 1;
      for (const issue of result.issues) issues[issue.reason] = (issues[issue.reason] ?? 0) + 1;
    }
    expect(nodes.length).toBeGreaterThan(0);
    expect(issues["unknown-legacy-contract"] ?? 0).toBe(0);
    expect(issues["unsupported-legacy-version"] ?? 0).toBe(0);
    await fs.writeFile(
      join(root, "legacy-plugin-content-report.json"),
      JSON.stringify({ nodes: nodes.length, counts, converted, issues }, null, 2)
    );
    console.log(
      "PLUGIN_CONTENT_VERIFIED",
      JSON.stringify({ nodes: nodes.length, counts, converted, issues })
    );
  }
);
