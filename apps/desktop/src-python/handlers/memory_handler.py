"""
长期记忆处理器。

职责：
- 读：memory_search
- 写：memory_archive_chat / memory_archive_diary / memory_delete_drawers

不通过 CLI，直接复用 mempalace 的内部模块和当前 Python WS RPC。
"""

from __future__ import annotations

import hashlib
import os
from datetime import datetime
from typing import Any, Callable

import chromadb

from mempalace.convo_miner import chunk_exchanges, detect_convo_room


CHAT_ROOM_MAP = {
    "architecture": "room_chat_architecture",
    "planning": "room_chat_architecture",
    "technical": "room_chat_architecture",
    "decisions": "room_chat_decisions",
    "problems": "room_chat_problems",
    "general": "room_chat_general",
}

DIARY_ROOM_MAP = {
    "daily": "room_diary_daily",
    "weekly": "room_diary_weekly",
    "monthly": "room_diary_monthly",
}


def _ensure_collection(palace_path: str):
    os.makedirs(palace_path, exist_ok=True)
    client = chromadb.PersistentClient(path=palace_path)
    return client.get_or_create_collection("mempalace_drawers")


def _safe_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        texts: list[str] = []
        for item in value:
            if isinstance(item, dict) and item.get("type") == "text" and isinstance(item.get("text"), str):
                texts.append(item["text"].strip())
        return "\n".join(text for text in texts if text).strip()
    return ""


def _normalize_messages(messages: list[dict]) -> str:
    lines: list[str] = []
    for message in messages:
        role = str(message.get("role", "")).strip().lower()
        if role == "tool":
            continue
        text = _safe_text(message.get("content"))
        if not text:
            continue
        if role == "user":
            lines.append(f"> {text}")
        else:
            lines.append(text)
        lines.append("---")
    return "\n".join(lines).strip()


def _chunk_diary(markdown: str) -> list[dict]:
    chunks: list[dict] = []
    paragraphs = [part.strip() for part in markdown.split("\n\n") if part.strip()]
    current = ""
    chunk_index = 0
    for paragraph in paragraphs:
        candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
        if len(candidate) > 1400 and current:
            chunks.append({"content": current, "chunk_index": chunk_index})
            chunk_index += 1
            current = paragraph
        else:
            current = candidate
    if current:
        chunks.append({"content": current, "chunk_index": chunk_index})
    return chunks


def _date_to_timestamp_ms(value: str | None, end_of_day: bool = False) -> int | None:
    if not value:
        return None
    candidate = str(value).strip()
    if not candidate:
        return None
    try:
        dt = datetime.strptime(candidate, "%Y-%m-%d")
        if end_of_day:
            dt = dt.replace(hour=23, minute=59, second=59, microsecond=999000)
        return int(dt.timestamp() * 1000)
    except ValueError:
        return None


def _meta_date_to_timestamp_ms(meta: dict[str, Any]) -> int | None:
    raw = meta.get("date_ts")
    if isinstance(raw, (int, float)):
        return int(raw)
    return _date_to_timestamp_ms(meta.get("date"))


def _read_text_file(file_path: str | None) -> str:
    if not file_path:
        return ""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"staging file not found: {file_path}")
    with open(file_path, "r", encoding="utf-8", errors="replace") as handle:
        return handle.read()


def _clear_existing_source(collection, source_type: str, source_id: int):
    try:
        result = collection.get(
            where={"$and": [{"source_type": source_type}, {"source_id": int(source_id)}]},
            include=[],
            limit=100000,
        )
        ids = result.get("ids", [])
        if ids:
            collection.delete(ids=ids)
    except Exception:
        # Chroma 版本行为可能不同，删除失败时忽略，由确定性 drawer_id 覆盖新结果
        return


def _drawer_id(main_db_name: str, source_type: str, source_id: int, archive_hash: str, chunk_index: int, room: str) -> str:
    raw = f"{main_db_name}:{source_type}:{source_id}:{archive_hash}:{chunk_index}:{room}"
    digest = hashlib.md5(raw.encode("utf-8"), usedforsecurity=False).hexdigest()[:16]
    return f"drawer_{source_type}_{source_id}_{digest}"


class MemoryHandler:
    """长期记忆 RPC 处理器"""

    async def handle_memory_status(self, params: dict, on_progress: Callable) -> dict:
        palace_path = params.get("palacePath")
        if not palace_path:
            raise ValueError("palacePath is required")

        info = {
            "palace_exists": os.path.isdir(palace_path),
            "available": True,
        }

        if os.path.isdir(palace_path):
            try:
                client = chromadb.PersistentClient(path=palace_path)
                collection = client.get_or_create_collection("mempalace_drawers")
                info["drawer_count"] = int(collection.count())
            except Exception as exc:
                info["available"] = False
                info["error"] = str(exc)
        return info

    async def handle_memory_search(self, params: dict, on_progress: Callable) -> dict:
        palace_path = params.get("palacePath")
        query = str(params.get("query", "")).strip()
        limit = int(params.get("limit", 5) or 5)
        room = params.get("room")
        source_types = params.get("sourceTypes") or []

        if not palace_path:
            raise ValueError("palacePath is required")
        if not query:
            return {"query": query, "hits": []}

        try:
            client = chromadb.PersistentClient(path=palace_path)
            collection = client.get_or_create_collection("mempalace_drawers")
        except Exception as exc:
            return {"query": query, "hits": [], "error": str(exc)}

        where: dict[str, Any] | None = None
        clauses: list[dict[str, Any]] = []
        if isinstance(room, str) and room.strip():
            clauses.append({"room": room.strip()})
        if clauses:
            where = {"$and": clauses} if len(clauses) > 1 else clauses[0]

        results = collection.query(
            query_texts=[query],
            n_results=max(limit * 5, limit),
            include=["documents", "metadatas", "distances"],
            where=where,
        )

        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]
        dists = results.get("distances", [[]])[0]

        hits: list[dict[str, Any]] = []
        for doc, meta, dist in zip(docs, metas, dists):
            source_type = meta.get("source_type", "")
            if source_types and source_type not in source_types:
                continue
            hits.append(
                {
                    "text": doc,
                    "similarity": round(1 - float(dist), 3),
                    "room": meta.get("room", "unknown"),
                    "wing": meta.get("wing", "unknown"),
                    "sourceType": source_type or "chat",
                    "sourceId": int(meta.get("source_id", 0) or 0),
                    "sourceVersion": int(meta.get("source_version", 0) or 0),
                    "chunkIndex": int(meta.get("chunk_index", 0) or 0),
                    "date": meta.get("date"),
                    "metadata": meta,
                }
            )
            if len(hits) >= limit:
                break

        return {"query": query, "hits": hits}

    async def handle_memory_archive_chat(self, params: dict, on_progress: Callable) -> dict:
        palace_path = params.get("palacePath")
        main_db_name = params.get("mainDbName")
        chat_id = int(params.get("chatId"))
        title = str(params.get("title", "")).strip()
        update_time = int(params.get("updateTime", 0) or 0)
        archive_hash = str(params.get("archiveHash", "")).strip()
        transcript_path = params.get("transcriptPath")
        messages = params.get("messages") or []
        if not palace_path or not main_db_name:
            raise ValueError("palacePath and mainDbName are required")

        transcript = _read_text_file(transcript_path) if transcript_path else _normalize_messages(messages)
        collection = _ensure_collection(palace_path)
        _clear_existing_source(collection, "chat", chat_id)

        chunks = chunk_exchanges(transcript) if transcript else []
        drawer_ids: list[str] = []
        rooms: list[str] = []
        valid_from = datetime.fromtimestamp(update_time / 1000).strftime("%Y-%m-%d") if update_time else None
        date_ts = int(update_time) if update_time else None

        for chunk in chunks:
            detected = detect_convo_room(chunk["content"])
            room = CHAT_ROOM_MAP.get(detected, "room_chat_general")
            drawer_id = _drawer_id(main_db_name, "chat", chat_id, archive_hash, int(chunk["chunk_index"]), room)
            metadata = {
                "wing": "wing_user_workspace",
                "room": room,
                "source_type": "chat",
                "source_id": chat_id,
                "source_version": update_time,
                "chunk_index": int(chunk["chunk_index"]),
                "main_db_name": main_db_name,
                "title": title,
                "archive_hash": archive_hash,
                "date": valid_from,
                "date_ts": date_ts,
                "filed_at": datetime.now().isoformat(),
                "parent_chat_id": params.get("parentChatId"),
                "branch_index": params.get("branchIndex"),
            }
            collection.upsert(ids=[drawer_id], documents=[chunk["content"]], metadatas=[metadata])
            drawer_ids.append(drawer_id)
            rooms.append(room)

        return {
            "success": True,
            "drawerIds": drawer_ids,
            "rooms": rooms,
        }

    async def handle_memory_archive_diary(self, params: dict, on_progress: Callable) -> dict:
        palace_path = params.get("palacePath")
        main_db_name = params.get("mainDbName")
        diary_id = int(params.get("diaryId"))
        diary_type = str(params.get("diaryType", "daily"))
        date = str(params.get("date", "")).strip()
        update_time = int(params.get("updateTime", 0) or 0)
        archive_hash = str(params.get("archiveHash", "")).strip()
        markdown_path = params.get("markdownPath")
        markdown = (
            _read_text_file(markdown_path)
            if markdown_path
            else str(params.get("markdown", "")).strip()
        )
        if not palace_path or not main_db_name:
            raise ValueError("palacePath and mainDbName are required")

        collection = _ensure_collection(palace_path)
        _clear_existing_source(collection, "diary", diary_id)

        room = DIARY_ROOM_MAP.get(diary_type, "room_diary_reflection")
        chunks = _chunk_diary(markdown) if markdown else []
        drawer_ids: list[str] = []
        rooms: list[str] = []
        date_ts = _date_to_timestamp_ms(date, end_of_day=False)

        for chunk in chunks:
            drawer_id = _drawer_id(main_db_name, "diary", diary_id, archive_hash, int(chunk["chunk_index"]), room)
            metadata = {
                "wing": "wing_user_life",
                "room": room,
                "source_type": "diary",
                "source_id": diary_id,
                "source_version": update_time,
                "chunk_index": int(chunk["chunk_index"]),
                "main_db_name": main_db_name,
                "archive_hash": archive_hash,
                "date": date,
                "date_ts": date_ts,
                "filed_at": datetime.now().isoformat(),
                "diary_type": diary_type,
            }
            collection.upsert(ids=[drawer_id], documents=[chunk["content"]], metadatas=[metadata])
            drawer_ids.append(drawer_id)
            rooms.append(room)

        return {
            "success": True,
            "drawerIds": drawer_ids,
            "rooms": rooms,
        }

    async def handle_memory_delete_drawers(self, params: dict, on_progress: Callable) -> dict:
        palace_path = params.get("palacePath")
        drawer_ids = params.get("drawerIds") or []
        if not palace_path:
            raise ValueError("palacePath is required")
        if not isinstance(drawer_ids, list):
            raise ValueError("drawerIds must be an array")

        collection = _ensure_collection(palace_path)
        if drawer_ids:
            collection.delete(ids=[str(item) for item in drawer_ids])
        return {"success": True, "deleted": len(drawer_ids)}

    def get_handlers(self) -> dict:
        return {
            "memory_status": self.handle_memory_status,
            "memory_search": self.handle_memory_search,
            "memory_archive_chat": self.handle_memory_archive_chat,
            "memory_archive_diary": self.handle_memory_archive_diary,
            "memory_delete_drawers": self.handle_memory_delete_drawers,
        }
