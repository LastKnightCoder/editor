import { createHash, webcrypto } from "node:crypto";
import AdmZip from "adm-zip";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "./index";
import { resetActionsKeyCache } from "./ci";
import { testEnvironment } from "./testing";

const AUTHOR = "42";
const REPO_ID = "9001";
let keys: CryptoKeyPair;
let jwk: JsonWebKey;
let f: ReturnType<typeof testEnvironment>;

const base64url = (value: Uint8Array | string) =>
  Buffer.from(value).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

async function token(claims: Record<string, unknown> = {}, kid = "k1") {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", kid }));
  const payload = base64url(
    JSON.stringify({
      iss: "https://token.actions.githubusercontent.com",
      aud: f.env.API_ORIGIN,
      iat: now,
      exp: now + 300,
      repository: "author/plugin",
      repository_id: REPO_ID,
      repository_visibility: "public",
      actor_id: AUTHOR,
      ref: "refs/tags/v1.1.0",
      ref_type: "tag",
      sha: "b".repeat(40),
      ...claims,
    })
  );
  const signature = await webcrypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keys.privateKey,
    new TextEncoder().encode(`${header}.${payload}`)
  );
  return `${header}.${payload}.${base64url(new Uint8Array(signature))}`;
}

function zip(version = "1.1.0", main = "module.exports={activate(){}}") {
  const file = new AdmZip();
  file.addFile(
    "test.reader/manifest.json",
    Buffer.from(
      JSON.stringify({
        id: "test.reader",
        name: "阅读插件",
        description: "同步阅读摘录",
        version,
        minAppVersion: "0.59.0",
        formatVersion: 1,
        apiVersion: 1,
        platform: "desktop",
        format: "cjs",
        main: "main.js",
        categories: ["page"],
        integrity: { "main.js": createHash("sha256").update(main).digest("hex") },
      })
    )
  );
  file.addFile("test.reader/main.js", Buffer.from(main));
  file.addFile("test.reader/README.md", Buffer.from("# 阅读插件\n\n使用说明"));
  return file.toBuffer();
}

const publish = async (bearer: string, bytes: Buffer = zip()) =>
  handle(
    new Request(`${f.env.API_ORIGIN}/v1/ci/releases`, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/zip" },
      body: bytes,
    }),
    f.env
  );

beforeAll(async () => {
  keys = (await webcrypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"]
  )) as CryptoKeyPair;
  jwk = await webcrypto.subtle.exportKey("jwk", keys.publicKey);
});
beforeEach(() => {
  resetActionsKeyCache();
  f = testEnvironment();
  f.env.REVIEWER_GITHUB_IDS = AUTHOR;
  f.sqlite.exec(`
    INSERT INTO publishers VALUES ('${AUTHOR}','author','');
    INSERT INTO publishers VALUES ('7','helper','');
    INSERT INTO plugins(id,publisher_id,repository_id,repository) VALUES ('test.reader','${AUTHOR}','${REPO_ID}','https://github.com/author/plugin');
  `);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).endsWith("/.well-known/jwks")
        ? Response.json({ keys: [{ ...jwk, kid: "k1", alg: "RS256", use: "sig" }] })
        : new Response("unexpected", { status: 500 })
    )
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  f.sqlite.close();
});

describe("CI 发布", () => {
  it("审核者自己的后台包也必须进入人工重点审核", async () => {
    const archive = new AdmZip(zip());
    const manifest = JSON.parse(archive.readAsText("test.reader/manifest.json"));
    const backend = "throw new Error('审核不得执行插件')";
    archive.addFile("test.reader/backend.js", Buffer.from(backend));
    archive.updateFile(
      "test.reader/manifest.json",
      Buffer.from(
        JSON.stringify({
          ...manifest,
          formatVersion: 2,
          backend: {
            entry: "backend.js",
            runtime: "node",
            apiVersion: 1,
            scope: "application",
            activation: "app-ready",
            lifetime: "persistent",
            reason: "设备同步",
            systemAccess: ["network"],
          },
          integrity: {
            ...manifest.integrity,
            "backend.js": createHash("sha256").update(backend).digest("hex"),
          },
        })
      )
    );
    const response = await publish(await token(), archive.toBuffer());
    expect(response.status).toBe(201);
    expect((await response.json()).data).toMatchObject({
      status: "pending_review",
      autoApproved: false,
      release: null,
    });
    expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM submission_reviews").get()).toEqual({
      n: 0,
    });
  });
  it("审核者本人推送 tag 时自动批准并发布，分类随包写入目录", async () => {
    const response = await publish(await token());
    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data).toMatchObject({
      pluginId: "test.reader",
      version: "1.1.0",
      status: "approved",
      autoApproved: true,
      release: { state: "published", version: "1.1.0" },
    });
    expect(f.sqlite.prepare("SELECT source_commit,repository FROM submissions").get()).toEqual({
      source_commit: "b".repeat(40),
      repository: "https://github.com/author/plugin",
    });
    expect(f.sqlite.prepare("SELECT categories FROM releases").get()).toEqual({
      categories: '["page"]',
    });
    // 重跑同一 tag 幂等，不产生第二条提交；发布已回收待审对象，幂等只靠上传记录保留的 sha256
    expect(f.objects.size).toBe(0);
    expect(f.sqlite.prepare("SELECT status FROM uploads").get()).toEqual({ status: "invalid" });
    const rerun = (await (await publish(await token())).json()).data;
    expect(rerun.submissionId).toBe(data.submissionId);
    expect(rerun.release.state).toBe("published");
    expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM submissions").get()).toEqual({ n: 1 });
  });

  it("协作者推送只进入待审，同版本换内容被拒", async () => {
    const response = await publish(await token({ actor_id: "7" }));
    expect((await response.json()).data).toMatchObject({
      status: "pending_review",
      autoApproved: false,
      release: null,
    });
    const changed = await publish(
      await token({ actor_id: "7" }),
      zip("1.1.0", "module.exports={activate(){ /* 改动 */ }}")
    );
    expect(changed.status).toBe(409);
    // 待审后审核者本人重跑，补做自动批准
    expect((await (await publish(await token())).json()).data.status).toBe("approved");
  });

  it("拒绝伪造、过期、非 tag、私有仓库、版本不一致与仓库不匹配", async () => {
    const cases: [string, number][] = [
      [(await token()).replace(/\.[^.]+$/, ".AAAA"), 401],
      [await token({ exp: Math.floor(Date.now() / 1000) - 600 }), 401],
      [await token({ aud: "https://other.example" }), 401],
      [await token({ iss: "https://evil.example" }), 401],
      [await token({}, "unknown-kid"), 401],
      [await token({ ref: "refs/heads/main", ref_type: "branch" }), 403],
      [await token({ repository_visibility: "private" }), 403],
      [await token({ ref: "refs/tags/v9.9.9" }), 400],
      [await token({ repository_id: "1234" }), 409],
    ];
    for (const [bearer, status] of cases) expect((await publish(bearer)).status).toBe(status);
    expect(
      (
        await handle(
          new Request(`${f.env.API_ORIGIN}/v1/ci/releases`, { method: "POST", body: zip() }),
          f.env
        )
      ).status
    ).toBe(401);
    expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM submissions").get()).toEqual({ n: 0 });
  });

  it("未经网页首次提交绑定仓库的插件不能走 CI", async () => {
    f.sqlite.exec("DELETE FROM plugins");
    expect((await publish(await token())).status).toBe(404);
  });
});
