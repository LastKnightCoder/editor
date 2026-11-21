# M3 Pro 上的本地中文转录与 Whisper 替代选型

2026-11-21。针对 Tau 的中文录音与视频笔记，这台 36 GB 的 M3 Pro 可以优先试 Qwen3-ASR-1.7B。0.6B 适合更看重等待时间或下载体积的情况。两个版本都已在本机离线跑通。决定是否切换视频笔记的默认引擎，还需要用实际素材比较漏句、术语和字幕跟读。

## 本机实测

Apple M3 Pro，12 核 CPU、18 核 GPU、36 GB 统一内存，macOS 26.5.1。用 macOS 的 Tingting 合成 9.27 秒普通话，转为 16 kHz 单声道 PCM WAV。三个引擎使用相同文件，显式指定中文。Whisper 使用 Tau 随包的 whisper.cpp 和本机已下载的多语种 base。Qwen 使用第三方 MLX 实现 0.4.4 和该作者的混合量化权重（解码器 4-bit，编码器 8-bit）。推理时启用 Hugging Face 离线模式。[MLX 实现与权重说明](https://github.com/moona3k/mlx-qwen3-asr)

| 引擎           | 每次启动 CLI 至输出，3 次中位数 | 模型常驻后，3 次中位数 | MLX 分配峰值 |
| -------------- | ------------------------------: | ---------------------: | -----------: |
| Whisper base   |                         0.37 秒 |                   未测 |            — |
| Qwen3-ASR-0.6B |                         0.58 秒 |                0.24 秒 |      0.77 GB |
| Qwen3-ASR-1.7B |                         0.89 秒 |                0.47 秒 |      1.63 GB |

CLI 计时包括进程启动及模型加载，模型均已下载，操作系统可复用文件缓存。常驻计时在同一 Python 进程预热一次再测三次。MLX 峰值仅计框架分配，整进程还会使用额外内存。表中 Qwen 两项均只转正文。

原文为「今天下午三点半，我们开一个项目会议。请把上周五的录音转成文字，再把第二段的时间记下来。」三者均识别出全部用词。Whisper base 输出繁体，Qwen 两版输出简体，句中标点略有差别。单条干净合成音频可验证运行和短句等待时间，实际会议、技术术语和长视频的表现需另测。

另用 1.7B 加官方 Qwen3-ForcedAligner-0.6B，在同一台机器离线生成三条 SRT，单次 CLI 耗时 1.83 秒。第一条在 3.84 秒结束，第二条从 3.92 秒开始，第三条从 6.80 秒开始。字幕末尾为 9.280 秒，比 WAV 时长多约 10 毫秒。已验证能生成时间轴，尚未测量与人工标注的误差。官方对齐器覆盖含中、英在内的 11 种语言，少于识别端的 30 种语言。[Qwen 官方说明](https://github.com/QwenLM/Qwen3-ASR)

## 不同素材的准确率

下表来自 Qwen 作者在公开测试集上的结果，中文为字错误率，英文为词错误率，均为百分比，越低越好。这里的 Whisper 是 large-v3，本机速度表用的是 base。模型发布方的结果也没有验证上面两个 MLX 量化版的精度。[官方模型卡与完整评测](https://huggingface.co/Qwen/Qwen3-ASR-0.6B)

| 公开数据集               | Whisper large-v3 | Qwen3-ASR-0.6B | Qwen3-ASR-1.7B |
| ------------------------ | ---------------: | -------------: | -------------: |
| WenetSpeech 网络中文     |             9.86 |           5.97 |           4.97 |
| WenetSpeech 中文会议     |            19.11 |           6.88 |           5.88 |
| LibriSpeech 清晰英文朗读 |             1.51 |           2.11 |           1.63 |
| LibriSpeech 较难英文朗读 |             3.97 |           4.55 |           3.38 |

一项独立的普通话配音实验提供了另一种参照。在 136 段读音正确的样本上，统一数字写法后，Qwen 1.7B、Qwen 0.6B、FireRedASR2-AED、Fun-ASR-Nano 和 Whisper large-v3 的字错误率分别为 2.1%、2.7%、2.9%、2.9% 和 3.8%。其中有模型会把读错的技术名词按正确拼写写出。这种倾向对整理笔记有帮助，对核对原话则可能掩盖错误。[实验设计与逐项结果](https://www.williamliu.ai/zh/blog/mandarin-asr-eleven-models/)

## 更新的模型和相近体量的候选

- **Qwen-Audio-3.1-ASR** 是更新的千问语音系列。阿里云提供短音频、长录音、流式和语音输入接口，部分变体可同时输出说话人和时间。到调研日，在 Qwen 官方公开权重目录中没有找到可下载的 3.1 小模型，也没有找到可确认与 0.6B 相当的参数规模。[阿里云模型选型](https://help.aliyun.com/zh/model-studio/asr-model) · [3.1 技术报告](https://arxiv.org/abs/2610.28711) · [Qwen 官方 ASR 权重目录](https://huggingface.co/models?search=Qwen%2FQwen3-ASR)
- **FireRedASR2-AED** 是 2026 年 2 月发布的十亿参数级开放权重模型。它支持中英混说、中文方言和原生词级时间戳。团队在四个普通话基准上报告平均字错误率 3.05%，同表 Qwen3-ASR-1.7B 为 3.76%。如果字幕跟读是主要用途，这是最值得同场比较的另一家模型。本轮未在本机运行它。[FireRed 项目与评测](https://github.com/FireRedTeam/FireRedASR2S) · [技术报告](https://arxiv.org/abs/2603.10420)
- **Fun-ASR-Nano-2512** 为 0.8B，适合中、英、日和中文方言。它早于 Qwen3-ASR。若需要原生时间戳，须选含已训练 CTC 层的权重，旧版本只支持正文。[官方模型卡](https://huggingface.co/FunAudioLLM/Fun-ASR-Nano-2512) · [官方权重版本说明](https://github.com/QwenAudio/Fun-ASR/blob/main/README_zh.md)
- **ARK-ASR-0.6B** 发布时间较晚。这里的 0.6B 指解码器，另有约 0.6B 的音频编码器。在作者同一套中文评测上，它与 Qwen 0.6B 的三项平均字错误率为 4.30% 和 4.36%，其中网络音频更好、会议稍弱。按中文转录选型，两者差距不足以单凭版本先后决定迁移。[ARK 官方模型卡](https://huggingface.co/Edge0/ARK-ASR-0.6B/blob/main/README.md)

## Tau 能替换到哪一层

Tau 的文件转录命令直接创建 Whisper 适配器，macOS 引擎调用 whisper-cli 输出 SRT，已有媒体调用方还读取适配器返回的 sourceResult。公共 ASR 契约同时支持纯文本、分段和带毫秒时间的词。接入 Qwen 的工作集中在本地推理运行时、模型资源，以及转录结果到媒体字幕的映射。Mac 上的 MLX 验证只覆盖 Apple Silicon。[文件转录入口](/apps/desktop/src-electron/main/modules/transcription.ts) · [Whisper 引擎](/apps/desktop/src-electron/main/services/whisper-engine.ts) · [文件识别契约](/packages/asr/README.md)

就个人使用而言，中文先试 Qwen 1.7B，偏好低延迟时选 0.6B。就产品默认值而言，应先用自己的中文会议、中英混说技术讲解和一段长视频对照当前 Whisper，检查人名与数字、静音后是否漏句、点击字幕是否跳到对应发言，同时比较包含对齐的总耗时。若实际录音更少需要人工修订且字幕能跟读，再把 Qwen 提为默认。
