import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const origin = "https://analytics.taunote.app";
const website = "https://tau-website-cvr.pages.dev";
const token = fs
  .readFileSync(path.join(os.homedir(), ".config/tau/analytics/admin-token"), "utf8")
  .trim();
if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("本机管理员秘密格式无效");
const marker = `deploy-check-${randomBytes(6).toString("hex")}`;
const installation = randomUUID();
const report = { tested_at: new Date().toISOString(), origin, marker, checks: [] };
const request = (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
const check = name => report.checks.push(name);
let failure;

try {
  const health = await request(origin + "/health");
  assert.equal(health.status, 200);
  assert.equal((await health.json()).data.ok, true);
  assert.equal((await request(origin + "/v1/admin/overview")).status, 401);
  check("健康检查与匿名访问拦截");

  const login = await request(origin + "/v1/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ token }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("Set-Cookie") ?? "";
  assert.ok(
    cookie.includes("HttpOnly") && cookie.includes("Secure") && cookie.includes("SameSite=Strict")
  );
  const headers = { Cookie: cookie.split(";")[0] };
  check("管理员登录与安全会话Cookie");

  const version = `0.0.0-${marker}`;
  const payload = {
    schema_version: 1,
    product: "tau-desktop",
    environment: "development",
    installation_id: installation,
    app_version: version,
    reported_at: new Date().toISOString(),
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await request(origin + "/v1/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data, {
      app_version: version,
      reported_at: payload.reported_at,
    });
  }
  check("最小版本上报及重复确认");
  assert.equal(
    (await request(origin + "/v1/events/batch", { method: "POST", body: "{}" })).status,
    410
  );
  check("行为采集接口已停用");

  const overview = await request(origin + "/v1/admin/overview?environment=development", {
    headers,
  });
  assert.equal(overview.status, 200);
  assert.ok((await overview.json()).data.reporting_installations >= 1);
  for (const endpoint of ["timeseries", "breakdown?dimension=versions"]) {
    const response = await request(
      `${origin}/v1/admin/${endpoint}${endpoint.includes("?") ? "&" : "?"}environment=development`,
      { headers }
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.meta.metric_version, 2);
    if (endpoint.includes("versions"))
      assert.ok(body.data.some(row => row.key === version && row.count === 1));
  }
  for (const endpoint of ["events", "retention"])
    assert.equal((await request(`${origin}/v1/admin/${endpoint}`, { headers })).status, 404);
  check("版本分布及下载查询，不再开放行为明细与留存");

  const preflight = await request(origin + "/v1/versions", {
    method: "OPTIONS",
    headers: { Origin: website, "Access-Control-Request-Method": "POST" },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), website);
  assert.equal(
    (
      await request(origin + "/v1/versions", {
        method: "OPTIONS",
        headers: { Origin: "https://invalid.example" },
      })
    ).status,
    403
  );
  check("官网来源放行及其他来源拒绝");

  const feed = await request("https://dl.taunote.app/desktop/latest.yml");
  assert.equal(feed.status, 200);
  const artifact = (await feed.text())
    .match(/^path:\s*(.+)$/m)?.[1]
    ?.trim()
    .replace(/^["']|["']$/g, "");
  assert.ok(artifact && /^Tau-v[a-zA-Z0-9.-]+\.exe$/.test(artifact));
  report.artifact = artifact;
  const userAgent = `TauDeploymentCheck/${marker}`;
  const downloadUrl = `${origin}/v1/downloads/${encodeURIComponent(artifact)}?channel=${marker}`;
  const head = await request(downloadUrl, {
    method: "HEAD",
    redirect: "manual",
    headers: { "User-Agent": userAgent },
  });
  assert.equal(head.status, 302);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await request(downloadUrl, {
      redirect: "manual",
      headers: { "User-Agent": userAgent },
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("Location"), `https://dl.taunote.app/desktop/${artifact}`);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
  const downloads = await request(origin + "/v1/admin/breakdown?dimension=downloads", { headers });
  const row = (await downloads.json()).data.find(item => item.key.endsWith(` · ${marker}`));
  assert.ok(row && row.count === 1);
  const bytes = await request(`https://dl.taunote.app/desktop/${artifact}`, {
    headers: { Range: "bytes=0-0", "User-Agent": userAgent },
  });
  if (bytes.status !== 206) {
    await bytes.body?.cancel();
    throw new Error("R2安装包范围读取验证失败");
  }
  assert.equal((await bytes.arrayBuffer()).byteLength, 1);
  check("R2对象校验、跳转、下载去重与实际文件1字节读取");

  const html = await request(origin + "/");
  assert.equal(html.status, 200);
  assert.ok((html.headers.get("Content-Security-Policy") ?? "").includes("frame-ancestors 'none'"));
  const content = await html.text();
  for (const match of content.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g))
    assert.equal((await request(origin + match[1])).status, 200);
  const logout = await request(origin + "/v1/admin/logout", { method: "POST", headers });
  assert.equal(logout.status, 200);
  assert.ok((logout.headers.get("Set-Cookie") ?? "").includes("Max-Age=0"));
  check("后台静态资源、安全头与退出登录");
} catch (error) {
  failure = error;
} finally {
  const sql =
    [
      `DELETE FROM installation_versions WHERE product='tau-desktop' AND environment='development' AND installation_id='${installation}'`,
      `DELETE FROM download_receipts WHERE channel='${marker}'`,
      `DELETE FROM daily_downloads WHERE channel='${marker}'`,
    ].join("; ") + ";";
  const cleaned = spawnSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "tau-analytics",
      "--remote",
      "--config",
      "infra/wrangler.production.jsonc",
      "--command",
      sql,
    ],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000 }
  );
  report.test_data_cleaned = cleaned.status === 0;
  if (!report.test_data_cleaned) failure ??= new Error("验证数据清理失败，请按报告marker检查");
  const directory = path.join(
    os.homedir(),
    ".local/share/tau/analytics/deployments",
    new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
  );
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(directory, `${marker}.json`), JSON.stringify(report, null, 2) + "\n", {
    mode: 0o600,
  });
}
console.log(JSON.stringify(report, null, 2));
if (failure) {
  console.error("远端验证未通过：" + failure.message);
  process.exitCode = 1;
}
