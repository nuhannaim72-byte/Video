"""The 12 AI employees and their departments, shared with the web app (shared/catalog.json)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache

from .config import get_settings


@dataclass(frozen=True)
class AgentProfile:
    id: str
    name: str
    role: str
    department: str
    summary: str
    job_description: str
    responsibilities: list[str]
    keywords: list[str]
    routine: list[str]


@dataclass(frozen=True)
class Catalog:
    company: dict
    departments: dict[str, dict]
    agents: dict[str, AgentProfile]

    def name(self, agent_id: str) -> str:
        a = self.agents.get(agent_id)
        return a.name if a else agent_id


@lru_cache
def get_catalog() -> Catalog:
    raw = json.loads(get_settings().catalog_path.read_text(encoding="utf-8"))
    agents = {
        a["id"]: AgentProfile(
            id=a["id"],
            name=a["name"],
            role=a["role"],
            department=a["department"],
            summary=a["summary"],
            job_description=a["jobDescription"],
            responsibilities=a["responsibilities"],
            keywords=a["keywords"],
            routine=a["routine"],
        )
        for a in raw["agents"]
    }
    return Catalog(company=raw["company"], departments={d["id"]: d for d in raw["departments"]}, agents=agents)
