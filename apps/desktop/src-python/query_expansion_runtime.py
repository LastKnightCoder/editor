"""
本地查询扩展运行时

职责：
- 懒加载本地生成模型（Transformers）
- 通过模型推理生成 typed 查询扩展（lex / vec / hyde）
- 模型缺失或不可用时返回 available=False，调用方自动降级
"""

from __future__ import annotations

import json
import os
import re
import threading
from typing import Any


class QueryExpansionRuntime:
    """本地查询扩展运行时"""

    def __init__(self):
        self._model = None
        self._tokenizer = None
        self._model_path: str | None = None
        self._device: str = "cpu"
        self._lock = threading.Lock()

    def _resolve_device(self, device_policy: str) -> str:
        try:
            import torch
        except Exception:
            return "cpu"

        policy = (device_policy or "auto").lower()
        cuda_available = bool(torch.cuda.is_available())
        if policy == "cuda":
            return "cuda" if cuda_available else "cpu"
        if policy == "cpu":
            return "cpu"
        return "cuda" if cuda_available else "cpu"

    def _load_model(self, model_path: str, device: str) -> None:
        try:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer
        except Exception as exc:
            raise RuntimeError(f"加载 transformers 运行依赖失败: {exc}") from exc

        tokenizer = AutoTokenizer.from_pretrained(
            model_path,
            local_files_only=True,
            trust_remote_code=True,
        )
        if tokenizer.pad_token_id is None and tokenizer.eos_token_id is not None:
            tokenizer.pad_token = tokenizer.eos_token

        model_kwargs: dict[str, Any] = {
            "local_files_only": True,
            "trust_remote_code": True,
        }
        if device == "cuda":
            model_kwargs["torch_dtype"] = torch.float16

        model = AutoModelForCausalLM.from_pretrained(
            model_path,
            **model_kwargs,
        )
        model.to(device)
        model.eval()

        self._tokenizer = tokenizer
        self._model = model
        self._model_path = model_path
        self._device = device

    def ensure_loaded(self, model_path: str, device_policy: str = "auto") -> None:
        target_device = self._resolve_device(device_policy)
        with self._lock:
            if (
                self._model is not None
                and self._tokenizer is not None
                and self._model_path == model_path
                and self._device == target_device
            ):
                return
            self._load_model(model_path, target_device)

    def _build_prompt(self, query: str, max_alternatives: int) -> str:
        safe_max = max(1, min(3, int(max_alternatives or 2)))
        return (
            "你是本地检索系统的查询扩展器。\n"
            "请基于用户问题输出 JSON，对象格式必须是：\n"
            '{"expansions":[{"type":"lex","text":"..."},{"type":"vec","text":"..."},{"type":"hyde","text":"..."}]}\n'
            "约束：\n"
            "1) type 只能是 lex / vec / hyde\n"
            "2) text 必须与原问题语义相关，避免重复原句\n"
            "3) expansions 最多返回 "
            f"{safe_max + 1} 项，优先覆盖三种 type\n"
            "4) 只输出 JSON，不要输出解释文字\n"
            f"用户问题：{query}\n"
        )

    def _extract_json(self, text: str) -> dict[str, Any] | None:
        if not text:
            return None

        start = text.find("{")
        while start != -1:
            depth = 0
            for index in range(start, len(text)):
                char = text[index]
                if char == "{":
                    depth += 1
                elif char == "}":
                    depth -= 1
                    if depth == 0:
                        candidate = text[start : index + 1].strip()
                        try:
                            parsed = json.loads(candidate)
                            if isinstance(parsed, dict):
                                return parsed
                        except Exception:
                            break
            start = text.find("{", start + 1)
        return None

    def _sanitize_expansions(
        self,
        query: str,
        payload: dict[str, Any] | None,
    ) -> list[dict[str, str]]:
        if not payload:
            return []

        raw_expansions = payload.get("expansions")
        if not isinstance(raw_expansions, list):
            return []

        valid_types = {"lex", "vec", "hyde"}
        by_type: dict[str, str] = {}
        seen = {query.strip().lower()}

        for item in raw_expansions:
            if not isinstance(item, dict):
                continue
            exp_type = item.get("type")
            exp_text = item.get("text")
            if exp_type not in valid_types or not isinstance(exp_text, str):
                continue
            normalized = exp_text.strip()
            if not normalized:
                continue
            dedupe_key = normalized.lower()
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            if exp_type not in by_type:
                by_type[exp_type] = normalized

        results: list[dict[str, str]] = []
        for exp_type in ("lex", "vec", "hyde"):
            text = by_type.get(exp_type)
            if text:
                results.append(
                    {
                        "type": exp_type,
                        "text": text,
                    }
                )
        return results

    def _build_fallback_expansions(
        self,
        query: str,
        max_alternatives: int,
    ) -> list[dict[str, str]]:
        safe_max = max(1, min(3, int(max_alternatives or 2)))
        tokens = [
            token.strip()
            for token in re.split(r"[^\w\u4e00-\u9fff]+", query.lower())
            if token and len(token.strip()) > 1
        ]
        if not tokens:
            tokens = [query.lower()]

        keyword_tail = " ".join(tokens[: safe_max + 1])
        fallback_candidates = [
            {"type": "lex", "text": f"{query} {keyword_tail} 关键术语".strip()},
            {"type": "vec", "text": f"{query} 的核心概念与关联知识"},
            {
                "type": "hyde",
                "text": f"这是一段关于 {query} 的知识说明，包含定义、关键要点、应用场景与示例。",
            },
        ]

        deduped: list[dict[str, str]] = []
        seen = {query.strip().lower()}
        for item in fallback_candidates:
            key = item["text"].strip().lower()
            if not key or key in seen:
                continue
            seen.add(key)
            deduped.append(item)
        return deduped[:3]

    def _is_qwen3_model(self, model_name: str) -> bool:
        normalized = (model_name or "").strip().lower()
        if "qwen3" in normalized:
            return True
        model_path = (self._model_path or "").strip().lower()
        return "qwen3" in model_path

    def _strip_think_block(self, text: str) -> str:
        if not text:
            return ""
        return re.sub(
            r"<think>[\s\S]*?</think>",
            "",
            text,
            flags=re.IGNORECASE,
        ).strip()

    def _build_generation_input(self, prompt: str, is_qwen3: bool):
        tokenizer = self._tokenizer
        if tokenizer is None:
            return {}

        if not is_qwen3:
            return tokenizer(prompt, return_tensors="pt")

        if hasattr(tokenizer, "apply_chat_template"):
            messages = [{"role": "user", "content": prompt}]
            chat_text = ""
            try:
                chat_text = tokenizer.apply_chat_template(
                    messages,
                    tokenize=False,
                    add_generation_prompt=True,
                    enable_thinking=False,
                )
            except TypeError:
                chat_text = tokenizer.apply_chat_template(
                    messages,
                    tokenize=False,
                    add_generation_prompt=True,
                )
            return tokenizer([chat_text], return_tensors="pt")

        return tokenizer(prompt, return_tensors="pt")

    def _infer_with_model(
        self,
        query: str,
        max_alternatives: int,
        model_name: str,
    ) -> tuple[list[dict[str, str]], str]:
        import torch

        tokenizer = self._tokenizer
        model = self._model
        if tokenizer is None or model is None:
            return [], ""

        prompt = self._build_prompt(query, max_alternatives)
        is_qwen3 = self._is_qwen3_model(model_name)
        inputs = self._build_generation_input(prompt, is_qwen3)
        if not inputs:
            return [], ""
        inputs = {key: value.to(self._device) for key, value in inputs.items()}

        pad_token_id = tokenizer.pad_token_id
        if pad_token_id is None:
            pad_token_id = tokenizer.eos_token_id

        generate_kwargs: dict[str, Any] = {
            **inputs,
            "max_new_tokens": 256,
            "pad_token_id": pad_token_id,
            "eos_token_id": tokenizer.eos_token_id,
        }
        if is_qwen3:
            # Qwen3 官方建议非思考模式采用采样参数，避免贪心导致退化/重复
            generate_kwargs.update(
                {
                    "do_sample": True,
                    "temperature": 0.7,
                    "top_p": 0.8,
                    "top_k": 20,
                }
            )
        else:
            generate_kwargs["do_sample"] = False

        with torch.inference_mode():
            output_ids = model.generate(**generate_kwargs)

        input_length = int(inputs["input_ids"].shape[1])
        generated_ids = output_ids[0][input_length:]
        generated_text = tokenizer.decode(generated_ids, skip_special_tokens=True)
        normalized_generated_text = self._strip_think_block(generated_text)
        payload = self._extract_json(normalized_generated_text)
        if payload is None:
            whole_text = tokenizer.decode(output_ids[0], skip_special_tokens=True)
            normalized_whole_text = self._strip_think_block(whole_text)
            payload = self._extract_json(normalized_whole_text)
            return self._sanitize_expansions(query, payload), normalized_whole_text[:220]
        return self._sanitize_expansions(query, payload), normalized_generated_text[:220]

    def expand(
        self,
        query: str,
        model_path: str,
        model_name: str,
        max_alternatives: int = 2,
        device_policy: str = "auto",
    ) -> dict[str, Any]:
        normalized_query = (query or "").strip()
        if not normalized_query:
            return {
                "available": False,
                "reason": "empty query",
                "expansions": [],
            }

        if not os.path.exists(model_path):
            return {
                "available": False,
                "reason": f"query expansion model not found: {model_path}",
                "expansions": [],
            }

        try:
            self.ensure_loaded(model_path, device_policy=device_policy)
            expansions, raw_preview = self._infer_with_model(
                normalized_query,
                max_alternatives,
                model_name,
            )
        except Exception as exc:
            return {
                "available": False,
                "reason": str(exc),
                "expansions": [],
            }

        if not expansions:
            fallback_expansions = self._build_fallback_expansions(
                normalized_query,
                max_alternatives,
            )
            if fallback_expansions:
                return {
                    "available": True,
                    "device": self._device,
                    "fallbackUsed": True,
                    "rawPreview": raw_preview,
                    "expansions": fallback_expansions,
                }
            return {
                "available": False,
                "reason": "query expansion model returned empty result",
                "rawPreview": raw_preview,
                "expansions": [],
            }

        return {
            "available": True,
            "device": self._device,
            "fallbackUsed": False,
            "rawPreview": raw_preview,
            "expansions": expansions,
        }


query_expansion_runtime = QueryExpansionRuntime()
