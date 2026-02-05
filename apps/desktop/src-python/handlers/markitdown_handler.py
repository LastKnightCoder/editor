"""
MarkItDown 文件转换处理器模块
处理文件转 Markdown 相关的 RPC 请求
"""

import sys
import asyncio
from typing import Optional, Callable
from pathlib import Path

from markitdown_converter import (
    MarkItDownConverter,
    create_converter,
)


class MarkItDownHandler:
    """MarkItDown 文件转换处理器"""

    async def handle_convert_file(self, params: dict, on_progress: Callable) -> dict:
        """
        处理单文件转换请求
        
        参数：
            filePath: 文件路径（必填）
            llmProvider: LLM 提供商 (openai/azure/ollama)
            llmApiKey: LLM API 密钥
            llmModel: LLM 模型名称
            llmPrompt: 自定义图片描述提示词
            llmBaseUrl: 自定义 API 地址
            docIntelEndpoint: Azure Document Intelligence 端点
            enablePlugins: 是否启用第三方插件
        """
        file_path = params.get("filePath")

        if not file_path:
            raise ValueError("filePath is required")

        # 提取 LLM 配置参数
        llm_provider = params.get("llmProvider")
        llm_api_key = params.get("llmApiKey")
        llm_model = params.get("llmModel")
        llm_prompt = params.get("llmPrompt")
        llm_base_url = params.get("llmBaseUrl")
        docintel_endpoint = params.get("docIntelEndpoint")
        enable_plugins = params.get("enablePlugins", False)
        # 获取当前事件循环
        loop = asyncio.get_running_loop()

        # 发送开始转换通知
        await on_progress({
            "type": "progress",
            "percentage": 0,
            "message": "Starting conversion..."
        })

        # 在线程池中执行转换（避免阻塞）
        result = await loop.run_in_executor(
            None,
            lambda: self._do_convert_file(
                file_path=file_path,
                llm_provider=llm_provider,
                llm_api_key=llm_api_key,
                llm_model=llm_model,
                llm_prompt=llm_prompt,
                llm_base_url=llm_base_url,
                docintel_endpoint=docintel_endpoint,
                enable_plugins=enable_plugins
            )
        )

        # 发送完成通知
        await on_progress({
            "type": "progress",
            "percentage": 100,
            "message": "Conversion completed"
        })

        return result

    def _do_convert_file(
        self,
        file_path: str,
        llm_provider: Optional[str] = None,
        llm_api_key: Optional[str] = None,
        llm_model: Optional[str] = None,
        llm_prompt: Optional[str] = None,
        llm_base_url: Optional[str] = None,
        docintel_endpoint: Optional[str] = None,
        enable_plugins: bool = False
    ) -> dict:
        """执行实际的文件转换工作"""
        # 创建转换器
        converter = create_converter(
            llm_provider=llm_provider,
            llm_api_key=llm_api_key,
            llm_model=llm_model,
            llm_prompt=llm_prompt,
            llm_base_url=llm_base_url,
            docintel_endpoint=docintel_endpoint,
            enable_plugins=enable_plugins
        )

        # 执行转换
        result = converter.convert(file_path)

        return {
            "success": result.success,
            "textContent": result.text_content,
            "title": result.title,
            "filePath": result.file_path,
            "error": result.error
        }

    async def handle_batch_convert(self, params: dict, on_progress: Callable) -> dict:
        """
        处理批量文件转换请求
        
        参数：
            filePaths: 文件路径数组（必填）
            outputDir: 输出目录（可选，如果指定则保存转换结果到文件）
            llmProvider: LLM 提供商 (openai/azure/ollama)
            llmApiKey: LLM API 密钥
            llmModel: LLM 模型名称
            llmPrompt: 自定义图片描述提示词
            llmBaseUrl: 自定义 API 地址
            docIntelEndpoint: Azure Document Intelligence 端点
            enablePlugins: 是否启用第三方插件
        """
        file_paths = params.get("filePaths", [])
        output_dir = params.get("outputDir")

        if not file_paths:
            raise ValueError("filePaths is required and must be a non-empty array")

        # 提取 LLM 配置参数
        llm_provider = params.get("llmProvider")
        llm_api_key = params.get("llmApiKey")
        llm_model = params.get("llmModel")
        llm_prompt = params.get("llmPrompt")
        llm_base_url = params.get("llmBaseUrl")
        docintel_endpoint = params.get("docIntelEndpoint")
        enable_plugins = params.get("enablePlugins", False)

        # 获取当前事件循环
        loop = asyncio.get_running_loop()

        total = len(file_paths)
        results = []
        successful = 0
        failed = 0

        # 创建转换器（复用同一个实例）
        converter = await loop.run_in_executor(
            None,
            lambda: create_converter(
                llm_provider=llm_provider,
                llm_api_key=llm_api_key,
                llm_model=llm_model,
                llm_prompt=llm_prompt,
                llm_base_url=llm_base_url,
                docintel_endpoint=docintel_endpoint,
                enable_plugins=enable_plugins
            )
        )

        for index, file_path in enumerate(file_paths):
            current = index + 1

            # 发送文件进度通知
            await on_progress({
                "type": "file_progress",
                "current": current,
                "total": total,
                "currentFile": file_path,
                "percentage": int((current - 1) / total * 100),
                "message": f"Converting file {current}/{total}: {file_path}"
            })

            # 在线程池中执行转换
            result = await loop.run_in_executor(
                None,
                lambda fp=file_path: self._do_batch_convert_single(converter, fp, output_dir)
            )

            results.append(result)

            if result["success"]:
                successful += 1
            else:
                failed += 1

        # 发送完成通知
        await on_progress({
            "type": "file_progress",
            "current": total,
            "total": total,
            "currentFile": "",
            "percentage": 100,
            "message": f"Batch conversion completed: {successful} succeeded, {failed} failed"
        })

        return {
            "success": failed == 0,
            "total": total,
            "successful": successful,
            "failed": failed,
            "results": results
        }

    def _do_batch_convert_single(
        self,
        converter: MarkItDownConverter,
        file_path: str,
        output_dir: Optional[str]
    ) -> dict:
        """执行单个文件的批量转换"""
        # 执行转换
        result = converter.convert(file_path)

        output_path = None

        # 如果指定了输出目录，保存结果到文件
        if output_dir and result.success and result.text_content:
            try:
                output_dir_path = Path(output_dir)
                output_dir_path.mkdir(parents=True, exist_ok=True)

                # 生成输出文件名
                source_path = Path(file_path)
                output_file = output_dir_path / f"{source_path.stem}.md"

                # 写入 Markdown 内容
                output_file.write_text(result.text_content, encoding="utf-8")
                output_path = str(output_file)
            except Exception as e:
                print(f"[MarkItDown] Error saving output: {e}", file=sys.stderr)

        return {
            "success": result.success,
            "textContent": result.text_content,
            "title": result.title,
            "filePath": result.file_path,
            "outputPath": output_path,
            "error": result.error
        }

    def get_handlers(self) -> dict:
        """返回该模块提供的处理器映射"""
        return {
            "convert_file": self.handle_convert_file,
            "batch_convert": self.handle_batch_convert,
        }
