// @vitest-environment node
import { expect, it, vi } from "vitest";
import { createBridgeFetch, FETCH_CHUNK_BYTES, type FetchTransport } from "../fetch-bridge";

function transport(overrides: Partial<FetchTransport> = {}): FetchTransport {
  return {
    open: async () => 1,
    upload: async () => true,
    response: async () => ({
      status: 200,
      statusText: "OK",
      headers: [],
      url: "https://example.com/file",
      redirected: false,
      type: "default",
      hasBody: true,
    }),
    read: async () => null,
    cancel: async () => undefined,
    ...overrides,
  };
}
it("超过 128 MiB 的上传按块传输，前一块完成后才继续", async () => {
  const length = 129 * 1024 * 1024 + 7;
  let produced = 0,
    uploaded = 0,
    maxChunk = 0,
    concurrent = 0,
    peak = 0;
  let complete!: () => void;
  const done = new Promise<void>(resolve => {
    complete = resolve;
  });
  const request = createBridgeFetch(
    transport({
      upload: async (_id, chunk) => {
        concurrent++;
        peak = Math.max(peak, concurrent);
        await Promise.resolve();
        if (chunk) {
          uploaded += chunk.length;
          maxChunk = Math.max(maxChunk, chunk.length);
        } else complete();
        concurrent--;
        return true;
      },
      response: async () => {
        await done;
        return {
          status: 204,
          statusText: "No Content",
          headers: [],
          url: "https://example.com/file",
          redirected: false,
          type: "default",
          hasBody: false,
        };
      },
    })
  );
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (produced === length) {
        controller.close();
        return;
      }
      const size = Math.min(1024 * 1024, length - produced);
      controller.enqueue(new Uint8Array(size));
      produced += size;
    },
  });
  const result = await request("https://example.com/file", {
    method: "PUT",
    body,
    duplex: "half",
  } as RequestInit);
  expect(result.status).toBe(204);
  expect(uploaded).toBe(length);
  expect(maxChunk).toBe(FETCH_CHUNK_BYTES);
  expect(peak).toBe(1);
});
it("arrayBuffer 使用宿主磁盘缓冲后的一份最终字节，仍遵守一次消费规则", async () => {
  const bytes = new Uint8Array([0, 255, 3]);
  const buffer = vi.fn(async () => bytes);
  const read = vi.fn(async () => null);
  const cancel = vi.fn(async () => undefined);
  const response = await createBridgeFetch(transport({ buffer, read, cancel }))(
    "https://example.com/file"
  );
  expect(response.bodyUsed).toBe(false);
  expect(buffer).not.toHaveBeenCalled();
  expect(await response.arrayBuffer()).toBe(bytes.buffer);
  expect(response.bodyUsed).toBe(true);
  expect(read).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledWith(1);
  await expect(response.arrayBuffer()).rejects.toThrow(TypeError);
  await expect(response.text()).rejects.toThrow(TypeError);
});
it("clone 保留标准分支消费，两分支均返回完整字节", async () => {
  const buffer = vi.fn(async () => new Uint8Array([1]));
  let calls = 0;
  const response = await createBridgeFetch(
    transport({ buffer, read: async () => (++calls === 1 ? new Uint8Array([1, 2, 3]) : null) })
  )("https://example.com/file");
  const clone = response.clone();
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  expect(new Uint8Array(await clone.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  expect(buffer).not.toHaveBeenCalled();
});
it("取消读取等待立即拒绝调用并通知执行端", async () => {
  const controller = new AbortController();
  const cancel = vi.fn(async () => undefined);
  const response = await createBridgeFetch(
    transport({ cancel, buffer: () => new Promise(() => {}) })
  )("https://example.com/file", { signal: controller.signal });
  const pending = response.arrayBuffer();
  controller.abort("stop-file");
  await expect(pending).rejects.toBe("stop-file");
  expect(cancel).toHaveBeenCalledWith(1);
});

it("连续无体响应先释放原生槽位，分块调用不耗尽请求池", async () => {
  let next = 0,
    peak = 0;
  const active = new Set<number>();
  const request = createBridgeFetch(
    transport({
      open: async () => {
        if (active.size >= 16) throw new Error("请求池已满");
        const id = ++next;
        active.add(id);
        peak = Math.max(peak, active.size);
        return id;
      },
      response: async () => ({
        status: 204,
        statusText: "No Content",
        headers: [],
        url: "https://example.com/file",
        redirected: false,
        type: "default",
        hasBody: false,
      }),
      cancel: async id => {
        await new Promise(resolve => setTimeout(resolve, 1));
        active.delete(id);
      },
    })
  );
  for (let index = 0; index < 24; index++)
    expect((await request("https://example.com/file")).status).toBe(204);
  expect(active.size).toBe(0);
  expect(peak).toBe(1);
});
it("落盘 arrayBuffer 完成前等待原生传输和临时文件释放", async () => {
  let released = false;
  const response = await createBridgeFetch(
    transport({
      buffer: async () => new Uint8Array([1]),
      cancel: async () => {
        await new Promise(resolve => setTimeout(resolve, 1));
        released = true;
      },
    })
  )("https://example.com/file");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1]));
  expect(released).toBe(true);
});
