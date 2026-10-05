import { concatMp3, parseMp3, type Mp3Stream } from "./mp3";

/**
 * 将多个 AudioBuffer 合并成一个
 */
export async function mergeAudioBuffers(
  audioContext: AudioContext,
  buffers: AudioBuffer[]
): Promise<AudioBuffer> {
  if (buffers.length === 0) {
    throw new Error("没有可合并的音频");
  }

  if (buffers.length === 1) {
    return buffers[0];
  }

  // 计算总时长
  const totalLength = buffers.reduce((sum, buffer) => sum + buffer.length, 0);

  // 使用第一个 buffer 的采样率和声道数
  const sampleRate = buffers[0].sampleRate;
  const numberOfChannels = buffers[0].numberOfChannels;

  // 创建合并后的 buffer
  const mergedBuffer = audioContext.createBuffer(numberOfChannels, totalLength, sampleRate);

  // 合并所有音频数据
  let offset = 0;
  for (const buffer of buffers) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      mergedBuffer.getChannelData(channel).set(channelData, offset);
    }
    offset += buffer.length;
  }

  return mergedBuffer;
}

/**
 * 将 ArrayBuffer 转换为 AudioBuffer
 */
export async function arrayBufferToAudioBuffer(
  audioContext: AudioContext,
  arrayBuffer: ArrayBuffer
): Promise<AudioBuffer> {
  return await audioContext.decodeAudioData(arrayBuffer);
}

/**
 * 将 AudioBuffer 转换为 Blob
 */
export async function audioBufferToBlob(
  audioBuffer: AudioBuffer,
  mimeType = "audio/wav"
): Promise<Blob> {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length * numberOfChannels * 2;
  const buffer = new ArrayBuffer(44 + length);
  const view = new DataView(buffer);
  const sampleRate = audioBuffer.sampleRate;

  // 写入 WAV 头
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + length, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numberOfChannels * 2, true);
  view.setUint16(32, numberOfChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, length, true);

  // 写入音频数据
  const offset = 44;
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = audioBuffer.getChannelData(channel)[i];
      const int16 = Math.max(-1, Math.min(1, sample)) * 0x7fff;
      view.setInt16(offset + (i * numberOfChannels + channel) * 2, int16, true);
    }
  }

  return new Blob([buffer], { type: mimeType });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * 为音频添加淡入淡出效果
 */
export function applyFadeInOut(
  audioBuffer: AudioBuffer,
  fadeInDuration = 0.5,
  fadeOutDuration = 0.5
): AudioBuffer {
  const sampleRate = audioBuffer.sampleRate;
  const fadeInSamples = Math.floor(fadeInDuration * sampleRate);
  const fadeOutSamples = Math.floor(fadeOutDuration * sampleRate);
  const numberOfChannels = audioBuffer.numberOfChannels;

  for (let channel = 0; channel < numberOfChannels; channel++) {
    const channelData = audioBuffer.getChannelData(channel);

    // 淡入
    for (let i = 0; i < fadeInSamples && i < channelData.length; i++) {
      channelData[i] *= i / fadeInSamples;
    }

    // 淡出
    const startFadeOut = channelData.length - fadeOutSamples;
    for (let i = startFadeOut; i < channelData.length; i++) {
      channelData[i] *= (channelData.length - i) / fadeOutSamples;
    }
  }

  return audioBuffer;
}

/**
 * 混合两个音频（例如添加背景音乐）
 */
export async function mixAudioBuffers(
  audioContext: AudioContext,
  mainBuffer: AudioBuffer,
  bgmBuffer: AudioBuffer,
  bgmVolume = 0.2
): Promise<AudioBuffer> {
  const sampleRate = mainBuffer.sampleRate;
  const numberOfChannels = mainBuffer.numberOfChannels;
  const length = mainBuffer.length;

  // 创建混合后的 buffer
  const mixedBuffer = audioContext.createBuffer(numberOfChannels, length, sampleRate);

  for (let channel = 0; channel < numberOfChannels; channel++) {
    const mainData = mainBuffer.getChannelData(channel);
    const mixedData = mixedBuffer.getChannelData(channel);

    // 复制主音频
    mixedData.set(mainData);

    // 混合背景音乐（如果存在）
    if (bgmBuffer && bgmBuffer.numberOfChannels > channel) {
      const bgmData = bgmBuffer.getChannelData(channel);
      const bgmLength = bgmData.length;

      for (let i = 0; i < length; i++) {
        // 循环播放背景音乐
        const bgmIndex = i % bgmLength;
        mixedData[i] += bgmData[bgmIndex] * bgmVolume;

        // 防止削峰
        mixedData[i] = Math.max(-1, Math.min(1, mixedData[i]));
      }
    }
  }

  return mixedBuffer;
}

/**
 * 计算音频时长（秒）
 */
export function getAudioDuration(audioBuffer: AudioBuffer): number {
  return audioBuffer.length / audioBuffer.sampleRate;
}

/** 一段 TTS 语音：MP3 直接按帧解析（不解码），其它格式解码为 PCM */
export interface SpeechSegment {
  data: ArrayBuffer;
  duration: number;
  mp3: Mp3Stream | null;
  buffer: AudioBuffer | null;
}

export async function loadSpeechSegment(
  audioContext: AudioContext,
  data: ArrayBuffer
): Promise<SpeechSegment> {
  const mp3 = parseMp3(data);
  if (mp3) {
    return { data, duration: mp3.duration, mp3, buffer: null };
  }
  // decodeAudioData 会转移（清空）入参，留一份原始数据给片段预览与重新合并
  const buffer = await arrayBufferToAudioBuffer(audioContext, data.slice(0));
  return { data, duration: buffer.duration, mp3: null, buffer };
}

/** 片段预览用的 Blob（MP3 标明类型，其它交给浏览器嗅探） */
export function speechSegmentToBlob(segment: SpeechSegment): Blob {
  return new Blob([segment.data], segment.mp3 ? { type: "audio/mpeg" } : undefined);
}

/**
 * 合并多段语音：全部是同采样率 MP3 时直接帧拼接（体积约为 WAV 的 1/6 - 1/12），
 * 否则解码后合并为 WAV。
 */
export async function mergeSpeechSegments(
  audioContext: AudioContext,
  segments: SpeechSegment[]
): Promise<{ blob: Blob; ext: "mp3" | "wav"; duration: number }> {
  if (segments.length === 0) {
    throw new Error("没有可合并的音频");
  }
  const streams = segments.map(segment => segment.mp3);
  if (streams.every((stream): stream is Mp3Stream => stream != null)) {
    const blob = concatMp3(streams);
    if (blob) {
      const duration = streams.reduce((sum, stream) => sum + stream.duration, 0);
      return { blob, ext: "mp3", duration };
    }
  }
  const buffers = await Promise.all(
    segments.map(
      segment => segment.buffer ?? arrayBufferToAudioBuffer(audioContext, segment.data.slice(0))
    )
  );
  const merged = await mergeAudioBuffers(audioContext, buffers);
  return { blob: await audioBufferToBlob(merged), ext: "wav", duration: getAudioDuration(merged) };
}
