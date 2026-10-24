import { ASRError, waitForASR } from "./errors";
import { validateASRAudioFormat } from "./stream";
import type { ASRAudioFormat, ASRAudioFrame } from "./types";

export const ASR_WORKLET_SOURCE = `
class TauCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.rate = options.processorOptions.rate;
    this.ratio = sampleRate / this.rate;
    this.remaining = this.ratio; this.sum = 0;
    this.capacity = Math.max(1, Math.round(this.rate / 5));
    this.buffer = new ArrayBuffer(this.capacity * 2);
    this.view = new DataView(this.buffer); this.count = 0;
    this.pending = 0; this.stopped = false;
    this.port.onmessage = ({data}) => {
      if (data === 'ack') this.pending = Math.max(0, this.pending - 1);
      if (data === 'stop' && !this.stopped) {
        if (this.remaining < this.ratio) this.sample(this.sum / (this.ratio - this.remaining));
        this.flush(); this.stopped = true; this.port.postMessage({type:'stopped'});
      }
    };
  }
  sample(value) {
    const clipped = Math.max(-1, Math.min(1, value));
    this.view.setInt16(this.count * 2, Math.round(clipped * (clipped < 0 ? 32768 : 32767)), true);
    this.count++;
    if (this.count === this.capacity) this.flush();
  }
  flush() {
    if (!this.count || this.stopped) return;
    if (this.pending >= 10) { this.stopped = true; this.port.postMessage({type:'overflow'}); return; }
    const data = this.count === this.capacity ? this.buffer : this.buffer.slice(0, this.count * 2);
    this.port.postMessage({type:'frame', data}, [data]); this.pending++;
    this.buffer = new ArrayBuffer(this.capacity * 2); this.view = new DataView(this.buffer); this.count = 0;
  }
  process(inputs) {
    if (this.stopped) return false;
    const channels = inputs[0]; if (!channels?.length) return true;
    for (let index = 0; index < channels[0].length; index++) {
      let value = 0; for (const channel of channels) value += channel[index]; value /= channels.length;
      let left = 1;
      while (left > 1e-9 && !this.stopped) {
        const weight = Math.min(left, this.remaining);
        this.sum += value * weight; this.remaining -= weight; left -= weight;
        if (this.remaining <= 1e-9) { this.sample(this.sum / this.ratio); this.sum = 0; this.remaining = this.ratio; }
      }
      if (this.stopped) break;
    }
    return !this.stopped;
  }
}
registerProcessor('tau-asr-capture', TauCapture);
`;

export interface MicrophoneCapture {
  stop(): Promise<void>;
  cancel(): Promise<void>;
}
/** 在用户点击的同步阶段创建并唤醒 AudioContext，权限与采集稍后才开始。 */
export function prepareMicrophone(signal: AbortSignal, onError: (error: unknown) => void) {
  if (
    !globalThis.navigator?.mediaDevices?.getUserMedia ||
    typeof AudioContext === "undefined" ||
    typeof AudioWorkletNode === "undefined"
  )
    throw new ASRError("unsupported", "当前设备不支持语音采集，请更新系统或 WebView");
  const context = new AudioContext();
  const resumed = context.resume();
  void resumed.catch(() => undefined);
  let stream: MediaStream | undefined;
  let node: AudioWorkletNode | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let moduleUrl: string | undefined;
  let closing: Promise<void> | undefined;
  const close = () => {
    if (!closing) {
      closing = Promise.resolve().then(async () => {
        signal.removeEventListener("abort", abort);
        if (node) {
          node.port.onmessage = null;
          node.disconnect();
        }
        source?.disconnect();
        stream?.getTracks().forEach(track => track.stop());
        if (moduleUrl) URL.revokeObjectURL(moduleUrl);
        if (context.state !== "closed") await context.close();
      });
    }
    return closing;
  };
  const abort = () => {
    void close().catch(() => undefined);
  };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  return {
    cancel: close,
    async start(
      format: ASRAudioFormat,
      write: (frame: ASRAudioFrame) => Promise<void>
    ): Promise<MicrophoneCapture> {
      validateASRAudioFormat(format);
      try {
        signal.throwIfAborted();
        await waitForASR(resumed, signal);
        moduleUrl = URL.createObjectURL(
          new Blob([ASR_WORKLET_SOURCE], { type: "text/javascript" })
        );
        await waitForASR(context.audioWorklet.addModule(moduleUrl), signal);
        const acquiring = navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
          video: false,
        });
        void acquiring
          .then(value => {
            if (signal.aborted || closing) value.getTracks().forEach(track => track.stop());
          })
          .catch(() => undefined);
        stream = await waitForASR(acquiring, signal);
        signal.throwIfAborted();
        node = new AudioWorkletNode(context, "tau-asr-capture", {
          processorOptions: { rate: format.sampleRateHz },
          outputChannelCount: [1],
        });
        source = context.createMediaStreamSource(stream);
        let seq = 0;
        let sample = 0;
        let queued = Promise.resolve();
        let stopped!: () => void;
        const flushed = new Promise<void>(resolve => {
          stopped = resolve;
        });
        let stopping: Promise<void> | undefined;
        node.port.onmessage = ({ data }) => {
          if (signal.aborted || closing) return;
          if (data.type === "overflow") {
            onError(new ASRError("busy", "语音发送过慢，已停止录音"));
            void close();
            return;
          }
          if (data.type === "stopped") {
            stopped();
            return;
          }
          if (data.type !== "frame") return;
          const bytes = new Uint8Array(data.data);
          const frame = { seq: seq++, startSample: sample, data: bytes };
          sample += bytes.byteLength / 2;
          queued = queued
            .then(() => {
              signal.throwIfAborted();
              return write(frame);
            })
            .then(() => node?.port.postMessage("ack"));
          void queued.catch(error => {
            if (!signal.aborted && !closing) {
              onError(error);
              void close();
            }
          });
        };
        for (const track of stream.getAudioTracks())
          track.onended = () => {
            if (!closing) onError(new Error("麦克风连接已结束"));
          };
        source.connect(node);
        node.connect(context.destination);
        return {
          cancel: close,
          stop() {
            if (!stopping)
              stopping = (async () => {
                const timeout = AbortSignal.timeout(2000);
                node!.port.postMessage("stop");
                try {
                  await waitForASR(flushed, AbortSignal.any([signal, timeout]));
                  await waitForASR(queued, signal);
                } finally {
                  await close();
                }
              })();
            return stopping;
          },
        };
      } catch (error) {
        await close();
        throw error;
      }
    },
  };
}
