//! 录音转写前的转码：常见音频 → 16 kHz 单声道 Ogg Opus。
//!
//! 只在识别服务声明的格式不含原文件格式时使用；Opus 16 kbps 一小时约 7 MB，兼顾上传体积与识别效果。
//! Ogg 封装与 granule 规则见 RFC 7845。

use std::{
    fs::File,
    io::{BufWriter, Read},
    path::Path,
};

use opusic_sys as opus;
use symphonia::core::{
    audio::SampleBuffer,
    codecs::{DecoderOptions, CODEC_TYPE_AAC},
    errors::Error as DecodeError,
    formats::FormatOptions,
    io::MediaSourceStream,
    meta::MetadataOptions,
    probe::Hint,
};

const OUTPUT_RATE: u32 = 16_000;
/// 20 ms 一帧
const FRAME_SAMPLES: usize = 320;
/// Opus 的 granule 恒按 48 kHz 计
const GRANULE_PER_SAMPLE: u64 = 48_000 / OUTPUT_RATE as u64;
const BITRATE: i32 = 16_000;
/// AAC-LC 编码器前置填充（Apple 编码器固定 2112 样本，Android 接近）；symphonia 0.5 不读 edit list，不裁会让时间戳整体后移
const AAC_PRIMING_SAMPLES: usize = 2112;
const STREAM_SERIAL: u32 = 0x7461_7531;

/// 转码产物的 MIME
pub(crate) const OGG_OPUS_MIME: &str = "audio/ogg";

/// 同步资源会使用 .bin 扩展名，无法按扩展名判断时读取文件头。
pub(crate) fn mime_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("m4a" | "mp4" | "aac") => "audio/mp4",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("ogg" | "oga" | "opus") => "audio/ogg",
        Some("flac") => "audio/flac",
        Some("webm") => "audio/webm",
        _ => {
            let mut header = [0; 12];
            let size = File::open(path)
                .and_then(|mut file| file.read(&mut header))
                .unwrap_or(0);
            let header = &header[..size];
            if header.starts_with(b"OggS") {
                "audio/ogg"
            } else if header.get(4..8) == Some(b"ftyp") {
                "audio/mp4"
            } else if header.starts_with(b"RIFF") && header.get(8..12) == Some(b"WAVE") {
                "audio/wav"
            } else if header.starts_with(b"fLaC") {
                "audio/flac"
            } else if header.len() >= 2 && header[0] == 0xff && header[1] & 0xf6 == 0xf0 {
                "audio/mp4"
            } else if header.starts_with(b"ID3")
                || (header.len() >= 2 && header[0] == 0xff && header[1] & 0xe0 == 0xe0)
            {
                "audio/mpeg"
            } else if header.starts_with(&[0x1a, 0x45, 0xdf, 0xa3]) {
                "audio/webm"
            } else {
                "application/octet-stream"
            }
        }
    }
}

/// 不解码估计时长（容器头里的帧数）；拿不到时为 None，由识别服务自己判断
pub(crate) fn probe_duration_ms(path: &Path) -> Option<u64> {
    let file = File::open(path).ok()?;
    let stream = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(extension) = path.extension().and_then(|value| value.to_str()) {
        hint.with_extension(extension);
    }
    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            stream,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .ok()?;
    let track = probed.format.default_track()?;
    let frames = track.codec_params.n_frames?;
    let rate = track.codec_params.sample_rate? as u64;
    (rate > 0).then(|| frames * 1000 / rate)
}

pub(crate) struct TranscodeOutput {
    pub(crate) size_bytes: u64,
    pub(crate) duration_ms: u64,
}

struct Encoder(*mut opus::OpusEncoder);
impl Drop for Encoder {
    fn drop(&mut self) {
        unsafe { opus::opus_encoder_destroy(self.0) };
    }
}
// 编码器只在单个阻塞任务内使用
unsafe impl Send for Encoder {}

impl Encoder {
    fn new() -> Result<(Self, u16), String> {
        let mut error = 0;
        let raw = unsafe {
            opus::opus_encoder_create(
                OUTPUT_RATE as i32,
                1,
                opus::OPUS_APPLICATION_VOIP,
                &mut error,
            )
        };
        if error != opus::OPUS_OK || raw.is_null() {
            return Err(format!("创建 Opus 编码器失败：{error}"));
        }
        let encoder = Self(raw);
        let mut lookahead = 0i32;
        unsafe {
            opus::opus_encoder_ctl(raw, opus::OPUS_SET_BITRATE_REQUEST, BITRATE);
            opus::opus_encoder_ctl(
                raw,
                opus::OPUS_GET_LOOKAHEAD_REQUEST,
                &mut lookahead as *mut i32,
            );
        }
        Ok((encoder, lookahead.max(0) as u16))
    }

    fn encode(&self, frame: &[f32], out: &mut [u8]) -> Result<usize, String> {
        let size = unsafe {
            opus::opus_encode_float(
                self.0,
                frame.as_ptr(),
                FRAME_SAMPLES as i32,
                out.as_mut_ptr(),
                out.len() as i32,
            )
        };
        if size < 0 {
            return Err(format!("Opus 编码失败：{size}"));
        }
        Ok(size as usize)
    }
}

/// 逐包写 Ogg：上一包延后一拍写出，以便最后一包带 EndStream 与真实 granule
struct OggOpusWriter {
    writer: ogg::PacketWriter<'static, BufWriter<File>>,
    pending: Option<Vec<u8>>,
    packets: u64,
}

impl OggOpusWriter {
    fn create(path: &Path, pre_skip: u16) -> Result<Self, String> {
        let file = File::create(path).map_err(|e| format!("创建转码文件失败：{e}"))?;
        let mut writer = ogg::PacketWriter::new(BufWriter::new(file));
        let mut head = b"OpusHead".to_vec();
        head.extend_from_slice(&[1, 1]);
        head.extend_from_slice(&pre_skip.to_le_bytes());
        head.extend_from_slice(&OUTPUT_RATE.to_le_bytes());
        head.extend_from_slice(&0i16.to_le_bytes());
        head.push(0);
        let vendor = b"tau";
        let mut tags = b"OpusTags".to_vec();
        tags.extend_from_slice(&(vendor.len() as u32).to_le_bytes());
        tags.extend_from_slice(vendor);
        tags.extend_from_slice(&0u32.to_le_bytes());
        for header in [head, tags] {
            writer
                .write_packet(header, STREAM_SERIAL, ogg::PacketWriteEndInfo::EndPage, 0)
                .map_err(|e| e.to_string())?;
        }
        Ok(Self {
            writer,
            pending: None,
            packets: 0,
        })
    }

    fn push(&mut self, packet: &[u8]) -> Result<(), String> {
        if let Some(previous) = self.pending.take() {
            let granule = self.packets * FRAME_SAMPLES as u64 * GRANULE_PER_SAMPLE;
            self.writer
                .write_packet(
                    previous,
                    STREAM_SERIAL,
                    ogg::PacketWriteEndInfo::NormalPacket,
                    granule,
                )
                .map_err(|e| e.to_string())?;
        }
        self.packets += 1;
        self.pending = Some(packet.to_vec());
        Ok(())
    }

    fn finish(mut self, final_granule: u64) -> Result<(), String> {
        if let Some(last) = self.pending.take() {
            self.writer
                .write_packet(
                    last,
                    STREAM_SERIAL,
                    ogg::PacketWriteEndInfo::EndStream,
                    final_granule,
                )
                .map_err(|e| e.to_string())?;
        }
        let mut inner = self.writer.into_inner();
        std::io::Write::flush(&mut inner).map_err(|e| e.to_string())
    }
}

/// 阻塞执行；`cancelled` 每解码一包检查一次
pub(crate) fn transcode_to_ogg_opus(
    input: &Path,
    output: &Path,
    cancelled: &dyn Fn() -> bool,
) -> Result<TranscodeOutput, String> {
    let file = File::open(input).map_err(|e| format!("打开录音失败：{e}"))?;
    let stream = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(extension) = input.extension().and_then(|value| value.to_str()) {
        hint.with_extension(extension);
    }
    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            stream,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| format!("无法识别音频格式：{e}"))?;
    let mut format = probed.format;
    let track = format
        .default_track()
        .ok_or("音频没有可解码的音轨")?
        .clone();
    let input_rate = track.codec_params.sample_rate.ok_or("音频缺少采样率")?;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| format!("不支持的音频编码：{e}"))?;

    let (encoder, lookahead) = Encoder::new()?;
    let pre_skip = (lookahead as u64 * GRANULE_PER_SAMPLE) as u16;
    let mut writer = OggOpusWriter::create(output, pre_skip)?;
    let mut packet = vec![0u8; 4000];

    let step = input_rate as f64 / OUTPUT_RATE as f64;
    let mut priming_left = if track.codec_params.codec == CODEC_TYPE_AAC {
        AAC_PRIMING_SAMPLES
    } else {
        0
    };
    let mut mono: Vec<f32> = Vec::new();
    let mut position = 0f64;
    let mut resampled: Vec<f32> = Vec::new();
    let mut real_samples: u64 = 0;

    loop {
        if cancelled() {
            return Err("转码已取消".into());
        }
        let next = match format.next_packet() {
            Ok(next) => next,
            Err(DecodeError::IoError(error))
                if error.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break
            }
            Err(error) => return Err(format!("读取音频失败：{error}")),
        };
        if next.track_id() != track.id {
            continue;
        }
        let decoded = match decoder.decode(&next) {
            Ok(decoded) => decoded,
            // 单个损坏包跳过，录音尾部被截断时常见
            Err(DecodeError::DecodeError(_)) => continue,
            Err(error) => return Err(format!("解码音频失败：{error}")),
        };
        let spec = *decoded.spec();
        let channels = spec.channels.count().max(1);
        let mut buffer = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
        buffer.copy_interleaved_ref(decoded);
        for frame in buffer.samples().chunks(channels) {
            if priming_left > 0 {
                priming_left -= 1;
                continue;
            }
            mono.push(frame.iter().sum::<f32>() / channels as f32);
        }
        // 线性插值重采样：语音识别用 16 kHz 足够，不引入额外依赖
        while position + 1.0 < mono.len() as f64 {
            let index = position as usize;
            let t = (position - index as f64) as f32;
            resampled.push(mono[index] * (1.0 - t) + mono[index + 1] * t);
            position += step;
        }
        // 游标可能越过缓冲末尾一步；越过的部分留到下一包继续跳过
        let consumed = (position as usize).min(mono.len());
        mono.drain(..consumed);
        position -= consumed as f64;
        while resampled.len() >= FRAME_SAMPLES {
            let size = encoder.encode(&resampled[..FRAME_SAMPLES], &mut packet)?;
            writer.push(&packet[..size])?;
            resampled.drain(..FRAME_SAMPLES);
            real_samples += FRAME_SAMPLES as u64;
        }
    }

    real_samples += resampled.len() as u64;
    // 补 lookahead 长度的静音让编码器吐出全部真实音频，再补齐整帧
    resampled.extend(std::iter::repeat(0.0).take(lookahead as usize));
    let pad = (FRAME_SAMPLES - resampled.len() % FRAME_SAMPLES) % FRAME_SAMPLES;
    resampled.extend(std::iter::repeat(0.0).take(pad));
    for frame in resampled.chunks(FRAME_SAMPLES) {
        let size = encoder.encode(frame, &mut packet)?;
        writer.push(&packet[..size])?;
    }
    if real_samples == 0 {
        return Err("录音没有声音内容".into());
    }
    writer.finish(pre_skip as u64 + real_samples * GRANULE_PER_SAMPLE)?;
    drop(encoder);

    let size_bytes = std::fs::metadata(output).map_err(|e| e.to_string())?.len();
    Ok(TranscodeOutput {
        size_bytes,
        duration_ms: real_samples * 1000 / OUTPUT_RATE as u64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn synced_audio_keeps_its_format_without_extension() {
        let dir = std::env::temp_dir().join(format!("tau-audio-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let input = dir.join("input.bin");
        let output = dir.join("output.bin");
        let samples = 16_000u32;
        let data_size = samples * 2;
        let mut wav = b"RIFF".to_vec();
        wav.extend_from_slice(&(36 + data_size).to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&samples.to_le_bytes());
        wav.extend_from_slice(&(samples * 2).to_le_bytes());
        wav.extend_from_slice(&2u16.to_le_bytes());
        wav.extend_from_slice(&16u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&data_size.to_le_bytes());
        wav.resize(44 + data_size as usize, 0);
        std::fs::write(&input, wav).unwrap();

        assert_eq!(mime_for_path(&input), "audio/wav");
        let converted = transcode_to_ogg_opus(&input, &output, &|| false).unwrap();
        assert!(converted.size_bytes > 0);
        assert_eq!(mime_for_path(&output), OGG_OPUS_MIME);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
