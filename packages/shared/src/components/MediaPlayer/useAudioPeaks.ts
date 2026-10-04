import { useEffect, useState } from "react";

/** 超过该时长不绘制波形（整段解码的内存与耗时不划算），退回普通进度线 */
export const WAVEFORM_MAX_DURATION = 30 * 60;
/** 解码采样率：波形只需要包络，8kHz 单声道足够且内存可控（30 分钟约 57MB 瞬时） */
const DECODE_SAMPLE_RATE = 8000;
/** 缓存的峰值精度；渲染时再按可用宽度池化 */
const PEAK_COUNT = 240;
const MIN_PEAK = 0.06;
const CACHE_LIMIT = 32;

/** 把各声道采样按桶取绝对值峰值，归一到 0-1（安静处保底 MIN_PEAK，避免断线） */
export function computePeaks(channels: Float32Array[], count: number): number[] {
  const length = channels[0]?.length ?? 0;
  if (!length || count <= 0) {
    return [];
  }
  const bucket = Math.max(1, Math.floor(length / count));
  const peaks: number[] = [];
  let globalMax = 0;
  for (let start = 0; start < length && peaks.length < count; start += bucket) {
    const end = Math.min(length, start + bucket);
    let max = 0;
    for (const data of channels) {
      for (let i = start; i < end; i++) {
        const value = Math.abs(data[i]);
        if (value > max) {
          max = value;
        }
      }
    }
    peaks.push(max);
    globalMax = Math.max(globalMax, max);
  }
  return peaks.map(peak =>
    globalMax > 0 ? Math.max(MIN_PEAK, Math.round((peak / globalMax) * 1000) / 1000) : MIN_PEAK
  );
}

/** 按目标柱数最大值池化；柱数不少于峰值数时原样返回 */
export function resamplePeaks(peaks: number[], bars: number): number[] {
  if (bars <= 0) {
    return [];
  }
  if (bars >= peaks.length) {
    return peaks;
  }
  const result: number[] = [];
  for (let i = 0; i < bars; i++) {
    const start = Math.floor((i * peaks.length) / bars);
    const end = Math.max(start + 1, Math.floor(((i + 1) * peaks.length) / bars));
    let max = 0;
    for (let j = start; j < end; j++) {
      max = Math.max(max, peaks[j]);
    }
    result.push(max);
  }
  return result;
}

const peaksCache = new Map<string, number[]>();

const remember = (key: string, peaks: number[]) => {
  peaksCache.delete(key);
  peaksCache.set(key, peaks);
  if (peaksCache.size > CACHE_LIMIT) {
    const oldest = peaksCache.keys().next().value;
    if (oldest !== undefined) {
      peaksCache.delete(oldest);
    }
  }
};

/** 默认取数：直接 fetch 播放地址（blob / data / 允许跨域的 http 可用） */
const fetchAudioData = async (src: string): Promise<ArrayBuffer> => {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.arrayBuffer();
};

interface AudioPeaksOptions {
  src: string | undefined;
  duration: number;
  /** 缓存键，默认取 src（blob 地址每次都变时应传稳定标识） */
  cacheKey?: string;
  /** 自定义取数（宿主能直接读文件时注入，绕开不支持 fetch 的媒体协议） */
  loadData?: () => Promise<ArrayBuffer>;
}

/**
 * 音频波形峰值：时长就绪且不超过 WAVEFORM_MAX_DURATION 时离线解码一次，结果按键缓存。
 * 取数 / 解码失败（跨域、协议不支持、格式）一律返回 null，由调用方退回进度线。
 */
export function useAudioPeaks({ src, duration, cacheKey, loadData }: AudioPeaksOptions) {
  const key = cacheKey ?? src;
  const eligible = !!src && !!key && duration > 0 && duration <= WAVEFORM_MAX_DURATION;
  const [peaks, setPeaks] = useState<number[] | null>(() =>
    key ? (peaksCache.get(key) ?? null) : null
  );

  useEffect(() => {
    if (!eligible || !key || !src) {
      setPeaks(null);
      return;
    }
    const cached = peaksCache.get(key);
    if (cached) {
      setPeaks(cached);
      return;
    }
    setPeaks(null);
    let cancelled = false;
    void (async () => {
      try {
        const OfflineContext =
          window.OfflineAudioContext ??
          (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
            .webkitOfflineAudioContext;
        if (!OfflineContext) {
          return;
        }
        const data = await (loadData ? loadData() : fetchAudioData(src));
        if (cancelled) {
          return;
        }
        const context = new OfflineContext(1, 1, DECODE_SAMPLE_RATE);
        const buffer = await context.decodeAudioData(data);
        const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
          buffer.getChannelData(i)
        );
        const result = computePeaks(channels, PEAK_COUNT);
        remember(key, result);
        if (!cancelled) {
          setPeaks(result);
        }
      } catch {
        // 取不到或解不了就不画波形，保持进度线
      }
    })();
    return () => {
      cancelled = true;
    };
    // loadData 由宿主每次渲染新建，按 key 判定是否需要重算；取数方式从无到有（如后台缓存完成）时重试一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, key, src, !!loadData]);

  return eligible ? peaks : null;
}
