/**
 * MP3 帧级解析与拼接：MP3 由独立帧组成，同采样率的多段去掉 ID3 标签与 Xing/Info 头帧后
 * 首尾相接即为合法文件，无需解码重编码。只支持 Layer III（TTS 输出即此格式）。
 */

export interface Mp3Stream {
  /** 仅音频帧（已剔除 ID3v2 / ID3v1 / Xing·Info·VBRI 头帧） */
  frames: Uint8Array;
  sampleRate: number;
  frameCount: number;
  /** 按帧数计的时长（秒），即拼接后该段在整条音频里实际占用的时长 */
  duration: number;
}

const BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG1
  2: [22050, 24000, 16000], // MPEG2
  0: [11025, 12000, 8000], // MPEG2.5
};

interface FrameHeader {
  length: number;
  sampleRate: number;
  samplesPerFrame: number;
  /** Xing/Info 标签在帧内的偏移（取决于版本与声道数） */
  xingOffset: number;
}

function readFrameHeader(bytes: Uint8Array, offset: number): FrameHeader | null {
  if (offset + 4 > bytes.length) return null;
  const [b0, b1, b2, b3] = bytes.subarray(offset, offset + 4);
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return null;
  const version = (b1 >> 3) & 0x03;
  const layer = (b1 >> 1) & 0x03;
  if (version === 1 || layer !== 1) return null;
  const bitrateIndex = b2 >> 4;
  const sampleRateIndex = (b2 >> 2) & 0x03;
  if (bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) return null;
  const mpeg1 = version === 3;
  const bitrate = (mpeg1 ? BITRATES_V1 : BITRATES_V2)[bitrateIndex] * 1000;
  const sampleRate = SAMPLE_RATES[version][sampleRateIndex];
  const padding = (b2 >> 1) & 0x01;
  const mono = b3 >> 6 === 3;
  return {
    length: Math.floor(((mpeg1 ? 144 : 72) * bitrate) / sampleRate) + padding,
    sampleRate,
    samplesPerFrame: mpeg1 ? 1152 : 576,
    xingOffset: 4 + (mpeg1 ? (mono ? 17 : 32) : mono ? 9 : 17),
  };
}

const asciiAt = (bytes: Uint8Array, offset: number, text: string) =>
  offset + text.length <= bytes.length &&
  Array.from(text).every((char, i) => bytes[offset + i] === char.charCodeAt(0));

function skipId3v2(bytes: Uint8Array): number {
  if (!asciiAt(bytes, 0, "ID3") || bytes.length < 10) return 0;
  const size =
    ((bytes[6] & 0x7f) << 21) |
    ((bytes[7] & 0x7f) << 14) |
    ((bytes[8] & 0x7f) << 7) |
    (bytes[9] & 0x7f);
  const hasFooter = (bytes[5] & 0x10) !== 0;
  return 10 + size + (hasFooter ? 10 : 0);
}

/** 解析 MP3 音频帧；不是 MP3、采样率不一致或一帧都没有时返回 null */
export function parseMp3(buffer: ArrayBuffer): Mp3Stream | null {
  const bytes = new Uint8Array(buffer);
  const dataStart = skipId3v2(bytes);
  let offset = dataStart;
  let firstFrameOffset = -1;
  const ranges: [number, number][] = [];
  let sampleRate = 0;
  let samplesPerFrame = 0;

  while (offset < bytes.length) {
    if (asciiAt(bytes, offset, "TAG")) break;
    const header = readFrameHeader(bytes, offset);
    if (!header) {
      // 首帧前允许少量填充字节，其后失步即视为尾部垃圾
      if (ranges.length === 0 && offset < 4096) {
        offset++;
        continue;
      }
      break;
    }
    if (offset + header.length > bytes.length) break;
    if (sampleRate && header.sampleRate !== sampleRate) return null;
    if (firstFrameOffset < 0) firstFrameOffset = offset;
    const isInfoFrame =
      ranges.length === 0 &&
      (asciiAt(bytes, offset + header.xingOffset, "Xing") ||
        asciiAt(bytes, offset + header.xingOffset, "Info") ||
        asciiAt(bytes, offset + 36, "VBRI"));
    if (!isInfoFrame) {
      ranges.push([offset, offset + header.length]);
      sampleRate = header.sampleRate;
      samplesPerFrame = header.samplesPerFrame;
    }
    offset += header.length;
  }

  // 连续帧只占文件一小部分，说明是误把其它格式里的字节当成了帧同步
  if (ranges.length === 0 || offset - firstFrameOffset < (bytes.length - dataStart) * 0.5) {
    return null;
  }
  const total = ranges.reduce((sum, [start, end]) => sum + end - start, 0);
  const frames = new Uint8Array(total);
  let cursor = 0;
  for (const [start, end] of ranges) {
    frames.set(bytes.subarray(start, end), cursor);
    cursor += end - start;
  }
  return {
    frames,
    sampleRate,
    frameCount: ranges.length,
    duration: (ranges.length * samplesPerFrame) / sampleRate,
  };
}

/** 拼接多段同采样率 MP3；采样率不一致时返回 null（调用方退回解码合并） */
export function concatMp3(streams: Mp3Stream[]): Blob | null {
  if (streams.length === 0) return null;
  const { sampleRate } = streams[0];
  if (streams.some(stream => stream.sampleRate !== sampleRate)) return null;
  return new Blob(
    streams.map(stream => stream.frames as BlobPart),
    { type: "audio/mpeg" }
  );
}
