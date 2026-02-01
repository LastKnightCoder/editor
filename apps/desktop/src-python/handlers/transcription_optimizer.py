"""
转录优化处理器模块
使用 LLM 将语音转录文本整理为结构清晰的 Markdown 文档
"""

import sys
import asyncio
import traceback
from typing import Optional, Callable

from markitdown_converter import create_llm_client


# ==================== 提示词定义 ====================

OPTIMIZATION_SYSTEM_PROMPT = """## 角色设定
你是一位专业的音视频转录整理专家，擅长将语音识别的原始文本整理成结构清晰、可读性强的 Markdown 文档。

## 任务说明
你将收到一段语音识别的转录文本。你需要将其整理为格式规范的 Markdown 文档。

## 整理原则

1. **段落划分**：根据语义和话题将内容分成合适的段落
2. **标点添加**：添加合适的标点符号使文本自然流畅
3. **清理冗余**：删除无意义的语气词（嗯、啊、那个等）和重复词
4. **修复错误**：修复明显的语音识别错误
5. **格式优化**：可以使用 Markdown 标题、列表等格式增强可读性

## 输出要求

1. 直接输出整理后的 Markdown 文本
2. 不要添加任何解释或说明
3. 保持原文意思，不要改写或润色
4. 如果是中文繁体，转换为简体中文
"""


class TranscriptionOptimizer:
    """转录优化处理器：将语音转录文本整理为 Markdown 文档"""

    async def handle_optimize_transcription(self, params: dict, on_progress: Callable) -> dict:
        """
        使用 LLM 将转录文本整理为 Markdown 文档
        
        参数：
            wordSegments: 词级时间戳数组 [{text, start, end}, ...]
            language: 语言代码 (zh/en)
            llmProvider: LLM 提供商 (openai/azure/ollama)
            llmApiKey: API 密钥
            llmModel: 模型名称
            llmBaseUrl: 自定义 API 地址
        
        返回：
            {"markdown": "整理后的 Markdown 文本"}
        """
        word_segments = params.get("wordSegments", [])
        language = params.get("language", "zh")
        llm_provider = params.get("llmProvider")
        llm_api_key = params.get("llmApiKey")
        llm_model = params.get("llmModel")
        llm_base_url = params.get("llmBaseUrl")

        if not word_segments:
            raise ValueError("wordSegments is required and must be a non-empty array")

        if not llm_provider or not llm_api_key or not llm_model:
            raise ValueError("llmProvider, llmApiKey, and llmModel are required")

        # 获取当前事件循环
        loop = asyncio.get_running_loop()

        # 发送开始通知
        await on_progress({
            "type": "progress",
            "percentage": 0,
            "message": "Starting transcription optimization..."
        })

        # 在线程池中执行 LLM 调用
        result = await loop.run_in_executor(
            None,
            lambda: self._do_optimize_transcription(
                word_segments=word_segments,
                language=language,
                llm_provider=llm_provider,
                llm_api_key=llm_api_key,
                llm_model=llm_model,
                llm_base_url=llm_base_url
            )
        )

        # 发送完成通知
        await on_progress({
            "type": "progress",
            "percentage": 100,
            "message": "Optimization completed"
        })

        return result

    def _do_optimize_transcription(
        self,
        word_segments: list,
        language: str,
        llm_provider: str,
        llm_api_key: str,
        llm_model: str,
        llm_base_url: Optional[str] = None
    ) -> dict:
        """执行实际的 LLM 转录优化，直接输出 Markdown"""
        # 创建 LLM 客户端
        llm_client = create_llm_client(
            provider=llm_provider,
            api_key=llm_api_key,
            base_url=llm_base_url
        )

        if not llm_client:
            raise ValueError(f"Failed to create LLM client for provider: {llm_provider}")

        # 构建提示词
        system_prompt = OPTIMIZATION_SYSTEM_PROMPT
        user_prompt = self._build_user_prompt(word_segments, language)

        print(f"[TranscriptionOptimizer] Processing {len(word_segments)} word segments with model: {llm_model}", file=sys.stderr)

        try:
            # 根据模型类型设置参数
            is_kimi_model = llm_model.startswith("kimi")
            not_support_temperature = any(
                llm_model.startswith(prefix) for prefix in ["o1", "o3", "o4", "gpt-5"]
            )

            # 构建请求参数
            request_params = {
                "model": llm_model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
            }

            # 设置 temperature（不同模型有不同要求）
            if is_kimi_model:
                # Kimi 模型不设置 temperature（某些模型不支持自定义）
                # 需要显式设置 thinking 参数为 disabled
                request_params["extra_body"] = {
                    "thinking": {"type": "disabled"}
                }
            elif not not_support_temperature:
                request_params["temperature"] = 0.3

            # 调用 LLM
            response = llm_client.chat.completions.create(**request_params)

            # 直接获取 LLM 输出的 Markdown 内容
            markdown_content = response.choices[0].message.content.strip()

            print(f"[TranscriptionOptimizer] Generated Markdown ({len(markdown_content)} chars)", file=sys.stderr)

            return {
                "markdown": markdown_content
            }
        except Exception as e:
            print(f"[TranscriptionOptimizer] LLM call failed: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            raise

    def _build_user_prompt(self, word_segments: list, language: str) -> str:
        """构建转录整理的用户提示词"""
        language_hint = "中文" if language == "zh" else ("英文" if language == "en" else language)

        # 提取所有文本内容，合并为纯文本
        raw_text = " ".join(seg.get("text", "") for seg in word_segments)

        traditional_hint = "\n\n**特别注意**：如果原文包含繁体中文，请全部转换为简体中文输出。" if language == "zh" else ""

        return f"""请将以下{language_hint}语音转录文本整理为结构清晰的 Markdown 文档：

{raw_text}

请直接输出整理后的 Markdown 文本，不要添加任何解释。{traditional_hint}"""

    def get_handlers(self) -> dict:
        """返回该模块提供的处理器映射"""
        return {
            "optimize_transcription": self.handle_optimize_transcription,
        }
