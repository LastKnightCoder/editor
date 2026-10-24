import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { ASR_WORKLET_SOURCE } from "./capture";
function capture(rate: number, target = 16000) {
  const messages: { type: string; data?: ArrayBuffer }[] = [];
  let Constructor: any;
  class AudioWorkletProcessor {
    port = { onmessage: undefined as any, postMessage: (data: any) => messages.push(data) };
  }
  runInNewContext(ASR_WORKLET_SOURCE, {
    AudioWorkletProcessor,
    sampleRate: rate,
    registerProcessor: (_: string, value: any) => {
      Constructor = value;
    },
  });
  const node = new Constructor({ processorOptions: { rate: target } });
  return { node, messages, stop: () => node.port.onmessage({ data: "stop" }) };
}
describe("采集 worklet 的格式、尾帧与容量", () => {
  it("48k 双声道混合到 16k 小端 Int16，保留最后不足一帧", () => {
    const { node, messages, stop } = capture(48000);
    node.process([[new Float32Array(9700).fill(1), new Float32Array(9700).fill(0)]]);
    stop();
    const frames = messages.filter(event => event.type === "frame");
    expect(frames.map(event => event.data!.byteLength)).toEqual([6400, 68]);
    const view = new DataView(frames[1].data!);
    expect(view.getInt16(0, true)).toBe(16384);
    expect(messages.at(-1)?.type).toBe("stopped");
    expect(node.process([])).toBe(false);
  });
  it("非整数采样比保留样本计数与负饱和值", () => {
    const { node, messages, stop } = capture(44100);
    node.process([[new Float32Array(4410).fill(-2)]]);
    stop();
    expect(messages[0].data!.byteLength).toBe(3200);
    expect(new DataView(messages[0].data!).getInt16(0, true)).toBe(-32768);
  });
  it("慢消费者达到 2 秒容量就失败，不无限累积", () => {
    const { node, messages, stop } = capture(16000);
    node.process([[new Float32Array(40000)]]);
    stop();
    expect(messages.filter(event => event.type === "frame")).toHaveLength(10);
    expect(messages.filter(event => event.type === "overflow")).toHaveLength(1);
    expect(node.process([])).toBe(false);
  });
  it("ACK 释放容量，重复停止不重复尾帧", () => {
    const { node, messages, stop } = capture(16000);
    for (let index = 0; index < 20; index++) {
      node.process([[new Float32Array(3200)]]);
      node.port.onmessage({ data: "ack" });
    }
    stop();
    stop();
    expect(messages.filter(event => event.type === "frame")).toHaveLength(20);
    expect(messages.filter(event => event.type === "overflow")).toHaveLength(0);
    expect(messages.filter(event => event.type === "stopped")).toHaveLength(1);
  });
});
