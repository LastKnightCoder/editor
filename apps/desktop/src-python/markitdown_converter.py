#!/usr/bin/env python3
"""
MarkItDown 文件转换模块
将各种文件格式转换为 Markdown，用于本地知识库构建

支持的文件格式：
- 文档：PDF、PowerPoint (PPTX)、Word (DOCX)、Excel (XLSX)
- 媒体：图片（EXIF 元数据 + OCR + LLM 描述）、音频（元数据 + 语音转录）
- 结构化数据：HTML、CSV、JSON、XML
- 其他：ZIP 文件、EPubs、YouTube URLs
"""

import sys
import traceback
from dataclasses import dataclass
from typing import Optional, Any, Callable
from pathlib import Path


@dataclass
class ConversionResult:
    """文件转换结果"""
    success: bool
    text_content: Optional[str]
    title: Optional[str]
    file_path: str
    error: Optional[str] = None


class MarkItDownConverter:
    """MarkItDown 文件转换器封装"""

    def __init__(
        self,
        llm_client: Optional[Any] = None,
        llm_model: Optional[str] = None,
        llm_prompt: Optional[str] = None,
        docintel_endpoint: Optional[str] = None,
        enable_plugins: bool = False
    ):
        """
        初始化转换器
        
        Args:
            llm_client: OpenAI 兼容的 LLM 客户端，用于图片描述
            llm_model: LLM 模型名称，如 gpt-4o
            llm_prompt: 自定义图片描述提示词
            docintel_endpoint: Azure Document Intelligence 端点
            enable_plugins: 是否启用第三方插件
        """
        from markitdown import MarkItDown
        
        self.md = MarkItDown(
            llm_client=llm_client,
            llm_model=llm_model,
            llm_prompt=llm_prompt,
            docintel_endpoint=docintel_endpoint,
            enable_plugins=enable_plugins
        )

    def convert(self, file_path: str) -> ConversionResult:
        """
        转换单个文件为 Markdown
        
        Args:
            file_path: 文件路径
            
        Returns:
            ConversionResult: 转换结果
        """
        temp_file_path = None
        try:
            # 展开 ~ 为实际的 home 目录路径
            path = Path(file_path).expanduser()
            if not path.exists():
                return ConversionResult(
                    success=False,
                    text_content=None,
                    title=None,
                    file_path=file_path,
                    error=f"File not found: {file_path}"
                )
            
            # 检查是否为 webp 格式，markitdown 不支持 webp，需要先转换为 png
            convert_path = path
            if path.suffix.lower() == '.webp':
                temp_file_path = self._convert_webp_to_png(path)
                if temp_file_path:
                    convert_path = temp_file_path
                    print(f"[MarkItDown] Converted webp to png: {temp_file_path}", file=sys.stderr)
                else:
                    print(f"[MarkItDown] Failed to convert webp, trying original file", file=sys.stderr)
            
            # 执行转换（使用展开后的绝对路径）
            result = self.md.convert(str(convert_path))
            
            return ConversionResult(
                success=True,
                text_content=result.text_content,
                title=result.title,
                file_path=file_path,
                error=None
            )
        except Exception as e:
            print(f"[MarkItDown] Conversion error: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            return ConversionResult(
                success=False,
                text_content=None,
                title=None,
                file_path=file_path,
                error=str(e)
            )
        finally:
            # 清理临时文件
            if temp_file_path and temp_file_path.exists():
                try:
                    temp_file_path.unlink()
                    print(f"[MarkItDown] Cleaned up temp file: {temp_file_path}", file=sys.stderr)
                except Exception:
                    pass
    
    def _convert_webp_to_png(self, webp_path: Path) -> Optional[Path]:
        """
        将 webp 图片转换为 png 格式
        
        Args:
            webp_path: webp 文件路径
            
        Returns:
            转换后的 png 临时文件路径，失败返回 None
        """
        try:
            from PIL import Image
            import tempfile
            
            # 打开 webp 图片
            with Image.open(webp_path) as img:
                # 创建临时 png 文件
                temp_fd, temp_path = tempfile.mkstemp(suffix='.png')
                import os
                os.close(temp_fd)
                
                # 转换并保存为 png
                # 如果有透明通道，保持 RGBA；否则转换为 RGB
                if img.mode in ('RGBA', 'LA', 'P'):
                    img = img.convert('RGBA')
                else:
                    img = img.convert('RGB')
                
                img.save(temp_path, 'PNG')
                return Path(temp_path)
        except Exception as e:
            print(f"[MarkItDown] Failed to convert webp to png: {e}", file=sys.stderr)
            return None


def create_llm_client(
    provider: str,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None
) -> Optional[Any]:
    """
    根据配置创建 LLM 客户端
    
    Args:
        provider: LLM 提供商 (openai/azure/ollama)
        api_key: API 密钥
        base_url: 自定义 API 地址（用于 Ollama 或自定义端点）
        
    Returns:
        OpenAI 兼容的客户端实例，或 None
    """
    if not provider:
        return None
    
    try:
        from openai import OpenAI, AzureOpenAI
        
        if provider == "openai":
            if not api_key:
                print("[MarkItDown] OpenAI API key is required", file=sys.stderr)
                return None
            return OpenAI(api_key=api_key, base_url=base_url)
        
        elif provider == "azure":
            if not api_key or not base_url:
                print("[MarkItDown] Azure API key and endpoint are required", file=sys.stderr)
                return None
            return AzureOpenAI(
                api_key=api_key,
                azure_endpoint=base_url,
                api_version="2024-02-15-preview"
            )
        
        elif provider == "ollama":
            # Ollama 使用 OpenAI 兼容接口
            ollama_base_url = base_url or "http://localhost:11434/v1"
            return OpenAI(
                api_key="ollama",  # Ollama 不需要真实的 API key
                base_url=ollama_base_url
            )
        
        else:
            print(f"[MarkItDown] Unknown LLM provider: {provider}", file=sys.stderr)
            return None
            
    except ImportError:
        print("[MarkItDown] OpenAI package not installed. Install with: pip install openai", file=sys.stderr)
        return None
    except Exception as e:
        print(f"[MarkItDown] Error creating LLM client: {e}", file=sys.stderr)
        return None


def create_converter(
    llm_provider: Optional[str] = None,
    llm_api_key: Optional[str] = None,
    llm_model: Optional[str] = None,
    llm_prompt: Optional[str] = None,
    llm_base_url: Optional[str] = None,
    docintel_endpoint: Optional[str] = None,
    enable_plugins: bool = False
) -> MarkItDownConverter:
    """
    创建配置好的转换器实例
    
    Args:
        llm_provider: LLM 提供商 (openai/azure/ollama)
        llm_api_key: LLM API 密钥
        llm_model: LLM 模型名称
        llm_prompt: 自定义图片描述提示词
        llm_base_url: 自定义 API 地址
        docintel_endpoint: Azure Document Intelligence 端点
        enable_plugins: 是否启用第三方插件
        
    Returns:
        配置好的 MarkItDownConverter 实例
    """
    # 创建 LLM 客户端（如果需要）
    llm_client = None
    if llm_provider:
        llm_client = create_llm_client(
            provider=llm_provider,
            api_key=llm_api_key,
            base_url=llm_base_url
        )
    return MarkItDownConverter(
        llm_client=llm_client,
        llm_model=llm_model,
        llm_prompt=llm_prompt,
        docintel_endpoint=docintel_endpoint,
        enable_plugins=enable_plugins
    )
