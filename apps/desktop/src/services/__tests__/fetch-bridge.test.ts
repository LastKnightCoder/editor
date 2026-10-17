// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createBridgeFetch } from "../fetch-bridge";
import { FetchServer } from "../../../src-electron/main/services/fetch-server";

let server: Server;
let base: string;
let engine: FetchServer;
let request: typeof fetch;
let release: () => void;
beforeEach(async () => {
  engine = new FetchServer();
  release = () => undefined;
  server = createServer(async (req, res) => {
    if (req.url === "/stream") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.write("first");
      release = () => res.end("last");
      return;
    }
    if (req.url === "/redirect") {
      res.writeHead(302, { Location: "/echo" });
      res.end();
      return;
    }
    if (req.url === "/error") {
      res.writeHead(418);
      res.end("teapot");
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Set-Cookie", ["a=1", "b=2"]);
    res.end(
      JSON.stringify({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString("base64"),
      })
    );
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  request = createBridgeFetch({
    open: async data => engine.open(1, structuredClone(data)),
    upload: (id, chunk) => engine.upload(1, id, structuredClone(chunk)),
    response: id => engine.response(1, id),
    read: id => engine.read(1, id),
    cancel: async id => engine.cancel(1, id),
  });
});
afterEach(async () => {
  release();
  engine.closeOwner(1);
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

it.each(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])(
  "%s 使用标准 RequestInit 和 Response",
  async method => {
    const response = await request(new URL(`${base}/echo?q=中文`), {
      method,
      headers: new Headers({ Cookie: "fixture=1", "X-Test": "header" }),
      ...(["GET", "HEAD"].includes(method) ? {} : { body: "  raw text  " }),
    });
    expect(response).toBeInstanceOf(Response);
    expect(response.ok).toBe(true);
    expect(response.headers.getSetCookie()).toEqual(["a=1", "b=2"]);
    expect(() => response.headers.set("x", "1")).toThrow(TypeError);
    if (method === "HEAD") expect(response.body).toBeNull();
    else {
      const data = await response.json();
      expect(data.method).toBe(method);
      expect(data.headers.cookie).toBe("fixture=1");
      expect(Buffer.from(data.body, "base64").toString()).toBe(
        method === "GET" ? "" : "  raw text  "
      );
      expect(response.bodyUsed).toBe(true);
      await expect(response.text()).rejects.toThrow();
    }
    await vi.waitFor(() => expect(engine.size).toBe(0));
  }
);

it("multipart/二进制由原生 Body API 编码，Request 对象可直接使用", async () => {
  const data = new FormData();
  data.append("name", "中文");
  data.append("file", new Blob([new Uint8Array([0, 1, 255])]), "fixture.bin");
  const result = await (
    await request(new Request(`${base}/echo`, { method: "POST", body: data }))
  ).json();
  const form = await new Response(Buffer.from(result.body, "base64"), {
    headers: { "Content-Type": result.headers["content-type"] },
  }).formData();
  expect(form.get("name")).toBe("中文");
  expect(new Uint8Array(await (form.get("file") as File).arrayBuffer())).toEqual(
    new Uint8Array([0, 1, 255])
  );
});

it("响应头先于响应体完成，clone 保留 URL/redirected，两个分支都可消费", async () => {
  const response = await request(`${base}/stream`);
  const clone = response.clone();
  expect(clone.url).toBe(`${base}/stream`);
  const reader = response.body?.getReader();
  expect(new TextDecoder().decode((await reader?.read())?.value)).toBe("first");
  release();
  expect(new TextDecoder().decode((await reader?.read())?.value)).toBe("last");
  expect((await reader?.read())?.done).toBe(true);
  expect(await clone.text()).toBe("firstlast");
  const redirected = await request(`${base}/redirect`);
  expect(redirected.redirected).toBe(true);
  expect(redirected.clone().url).toBe(`${base}/echo`);
  await redirected.text();
});

it("signal 在收到响应头后仍能取消流，预取消不创建执行端请求", async () => {
  const controller = new AbortController();
  const response = await request(`${base}/stream`, { signal: controller.signal });
  controller.abort("caller-stop");
  await expect(response.text()).rejects.toBe("caller-stop");
  await expect(request(`${base}/echo`, { signal: controller.signal })).rejects.toBe("caller-stop");
  await vi.waitFor(() => expect(engine.size).toBe(0));
});

it("非 2xx 正常返回，manual 保留重定向及 Cookie，error 抛 TypeError", async () => {
  const error = await request(`${base}/error`);
  expect(error.status).toBe(418);
  expect(error.ok).toBe(false);
  expect(await error.text()).toBe("teapot");
  const manual = await request(`${base}/redirect`, { redirect: "manual" });
  expect(manual.status).toBe(302);
  await manual.body?.cancel();
  await expect(request(`${base}/redirect`, { redirect: "error" })).rejects.toBeInstanceOf(
    TypeError
  );
  await vi.waitFor(() => expect(engine.size).toBe(0));
});

it("上传流按读取进度传输，body.cancel 与窗口销毁释放请求", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("stream body"));
      controller.close();
    },
  });
  const response = await request(`${base}/echo`, {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit);
  expect(Buffer.from((await response.json()).body, "base64").toString()).toBe("stream body");
  const stream = await request(`${base}/stream`);
  await stream.body?.cancel();
  await vi.waitFor(() => expect(engine.size).toBe(0));
  await request(`${base}/stream`);
  engine.closeOwner(1);
  expect(engine.size).toBe(0);
});

it("keepalive 的普通请求体能传输", async () => {
  const result = await (
    await request(`${base}/echo`, { method: "POST", body: "keepalive", keepalive: true })
  ).json();
  expect(Buffer.from(result.body, "base64").toString()).toBe("keepalive");
});
