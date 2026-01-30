from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class Wordbank:
    categories: dict[str, list[str]]

    def normalize(self) -> "Wordbank":
        norm: dict[str, list[str]] = {}
        for k, words in (self.categories or {}).items():
            cat = str(k).strip()
            if not cat:
                continue
            uniq: list[str] = []
            seen = set()
            for w in words or []:
                s = str(w).strip()
                if not s:
                    continue
                if s in seen:
                    continue
                seen.add(s)
                uniq.append(s)
            if uniq:
                norm[cat] = uniq
        if not norm:
            norm = {"默认": ["熊猫", "饺子", "火锅", "长城", "京剧"]}
        return Wordbank(categories=norm)


def parse_wordbank_payload(payload: Any) -> Wordbank:
    """Accept either:
    - {"categories": {"美食": ["火锅"], ...}}
    - {"美食": ["火锅"], ...}
    """
    if not isinstance(payload, dict):
        raise ValueError("wordbank payload must be an object")

    if "categories" in payload and isinstance(payload["categories"], dict):
        cats = payload["categories"]
    else:
        cats = payload

    if not isinstance(cats, dict):
        raise ValueError("categories must be an object")

    return Wordbank(categories=cats).normalize()


def load_wordbank(path: Path) -> Wordbank:
    if not path.exists():
        return Wordbank(categories={"默认": ["熊猫", "饺子", "火锅", "长城", "京剧"]}).normalize()
    data = json.loads(path.read_text(encoding="utf-8"))
    return parse_wordbank_payload(data)


def save_wordbank(path: Path, wb: Wordbank) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"categories": wb.categories}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
