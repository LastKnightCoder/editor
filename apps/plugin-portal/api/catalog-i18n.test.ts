import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { inspectPackage } from "./package";
import { handle } from "./index";
import { testEnvironment } from "./testing";

function makePluginZip(
  options: {
    id?: string;
    manifestExtra?: Record<string, unknown>;
    extraFiles?: Record<string, string>;
  } = {}
) {
  const id = options.id ?? "test.localized";
  const code =
    "module.exports = { id: 'test.localized', name: '计数器', version: '1.0.0', apiVersion: 1, create: () => ({ activate() {} }) };";
  const hash = createHash("sha256").update(code).digest("hex");
  const manifest = {
    formatVersion: 4,
    platform: "portable",
    apiVersion: 1,
    kind: "plugin",
    profile: "web-v1",
    format: "cjs",
    id,
    name: "计数器",
    description: "记录每日计数。",
    categories: ["page"],
    keywords: ["计数"],
    version: "1.0.0",
    targets: { desktop: { minAppVersion: "0.66.3" } },
    main: "main.js",
    integrity: { "main.js": hash },
    ...options.manifestExtra,
  };
  const zip = new AdmZip();
  zip.addFile(`${id}/manifest.json`, Buffer.from(JSON.stringify(manifest)));
  zip.addFile(`${id}/main.js`, Buffer.from(code));
  zip.addFile(`${id}/README.md`, Buffer.from("# 计数器\n默认中文说明。"));
  for (const [fileName, body] of Object.entries(options.extraFiles ?? {})) {
    zip.addFile(`${id}/${fileName}`, Buffer.from(body));
  }
  return new Uint8Array(zip.toBuffer());
}

describe("插件门户多语言元数据与 README 契约", () => {
  it("包检查放行规范多语言 README，保留 manifest.i18n/locales，老包省略 readmes", async () => {
    const legacy = await inspectPackage(makePluginZip({ id: "test.legacy" }));
    expect(legacy.readme).toContain("默认中文说明");
    expect(legacy).not.toHaveProperty("readmes");
    expect(legacy.manifest).not.toHaveProperty("i18n");
    expect(legacy.manifest).not.toHaveProperty("locales");

    const localized = await inspectPackage(
      makePluginZip({
        manifestExtra: {
          locales: ["zh-CN", "en-us"],
          i18n: {
            "en-us": {
              name: "Counter",
              description: "Track daily counts.",
              keywords: ["counter", "tally"],
            },
          },
        },
        extraFiles: {
          "README.en-us.md": "# Counter\nEnglish documentation.",
          "README.zh-TW.md": "# 計數器\n繁體說明。",
        },
      })
    );
    expect(localized.manifest.locales).toEqual(["zh-CN", "en-US"]);
    expect(localized.manifest.i18n).toEqual({
      "en-US": {
        name: "Counter",
        description: "Track daily counts.",
        keywords: ["counter", "tally"],
      },
    });
    expect(localized.readmes).toEqual({
      "en-US": "# Counter\nEnglish documentation.",
      "zh-TW": "# 計數器\n繁體說明。",
    });
  });

  it("拒绝重复规范化语言、空白或非法文件名的多语言 README", async () => {
    await expect(
      inspectPackage(
        makePluginZip({
          extraFiles: {
            "README.en-us.md": "# A",
            "README.en-US.md": "# B",
          },
        })
      )
    ).rejects.toMatchObject({ status: 422 });

    await expect(
      inspectPackage(makePluginZip({ extraFiles: { "README.en-US.md": "   \n" } }))
    ).rejects.toMatchObject({ status: 422 });

    await expect(
      inspectPackage(makePluginZip({ extraFiles: { "README.bad_locale.md": "# Bad" } }))
    ).rejects.toMatchObject({ status: 422 });
  });

  it("目录接口返回可选 i18n/locales 并支持跨语言搜索", async () => {
    const { env, sqlite } = testEnvironment();
    const content = await inspectPackage(
      makePluginZip({
        manifestExtra: {
          locales: ["zh-CN", "en-US"],
          i18n: {
            "en-US": {
              name: "Counter",
              description: "Track daily counts.",
              keywords: ["tally"],
            },
          },
        },
        extraFiles: { "README.en-US.md": "# Counter" },
      })
    );
    sqlite.exec("INSERT INTO publishers VALUES('p1','dev','')");
    sqlite.exec(
      "INSERT INTO uploads(id,publisher_id,status,file_name,size,created_at) VALUES('u1','p1','ready','p.zip',100,'2026-01-01')"
    );
    sqlite.exec(
      "INSERT INTO submissions(id,publisher_id,client_request_id,status,created_at,updated_at,submitted_at) VALUES('s1','p1','req1','approved','2026-01-01','2026-01-01','2026-01-01')"
    );
    sqlite
      .prepare(
        "INSERT INTO releases(id,plugin_id,version,format_version,profile,targets_json,submission_id,package_upload_id,publisher_id,object_key,sha256,size,content_json,repository,source_commit,name,description,min_app_version,categories,keywords,state,created_at,published_at) VALUES('r1','test.localized','1.0.0',4,'web-v1',?,'s1','u1','p1','k1',?,100,?,'https://github.com/a/b','abc','计数器','记录每日计数。','0.66.3','[\"page\"]','[\"计数\"]','published','2026-01-01','2026-01-01')"
      )
      .run(
        JSON.stringify({ desktop: { minAppVersion: "0.66.3" } }),
        "b".repeat(64),
        JSON.stringify(content)
      );

    const search = await handle(
      new Request("https://api.example/v2/catalog/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "all", q: "tally" }),
      }),
      env
    );
    expect(search.status).toBe(200);
    const body = (await search.json()) as {
      data: { items: Array<{ pluginId: string; i18n?: unknown; locales?: string[] }> };
    };
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].pluginId).toBe("test.localized");
    expect(body.data.items[0].locales).toEqual(["zh-CN", "en-US"]);
    expect(body.data.items[0].i18n).toEqual({
      "en-US": { name: "Counter", description: "Track daily counts.", keywords: ["tally"] },
    });

    const releaseRes = await handle(new Request("https://api.example/v2/releases/r1"), env);
    const releaseBody = (await releaseRes.json()) as {
      data: { content: { readmes?: Record<string, string> } };
    };
    expect(releaseBody.data.content.readmes).toEqual({ "en-US": "# Counter" });
  });
});
