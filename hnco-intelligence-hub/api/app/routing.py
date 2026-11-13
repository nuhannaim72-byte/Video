"""Keyword routing and external-action detection. Mirrors web/src/lib/sim/router.ts."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .catalog import get_catalog


@dataclass
class RoutingDecision:
    assignee: str
    collaborators: list[str] = field(default_factory=list)
    reason: str = ""


def _normalise(text: str) -> str:
    t = re.sub(r"[^a-z0-9&\- ]+", " ", text.lower())
    collapsed = re.sub(r"\s+", " ", t).strip()
    return f" {collapsed} "


def route_by_keywords(text: str) -> RoutingDecision:
    t = _normalise(text)
    cat = get_catalog()
    scores: dict[str, int] = {}
    for a in cat.agents.values():
        score = 0
        for kw in a.keywords:
            k = kw.lower()
            if f" {k} " in t or f" {k}s " in t:
                score += 3 if " " in k else 2
        if score:
            scores[a.id] = score
    ranked = sorted(((i, s) for i, s in scores.items() if i != "executive"), key=lambda x: -x[1])
    if not ranked:
        return RoutingDecision("strategy", [], "No department keywords matched; defaulting to Strategy & Advisory for scoping.")
    top, top_score = ranked[0]
    collaborators = [i for i, s in ranked[1:] if s >= max(2, top_score / 2)][:2]
    reason = f"Best match: {cat.name(top)}"
    if collaborators:
        reason += ", supported by " + " and ".join(cat.name(c) for c in collaborators)
    return RoutingDecision(top, collaborators, reason + ".")


_EXTERNAL = [
    (r"\b(send|email|e-mail|mail)\b", "Send to an external recipient"),
    (r"\b(publish|post|tweet|go live)\b", "Publish externally"),
    (r"\b(submit)\b.*\b(tender|rfp|bid|proposal)\b", "Submit to a client or prospect"),
    (r"\b(sign|execute)\b.*\b(contract|agreement|nda)\b", "Sign or execute a legal document"),
    (r"\b(pay|transfer|wire|invoice the)\b", "Make or request a payment"),
    (r"\b(contact|call|message)\b.*\b(client|customer|prospect|lead)s?\b", "Contact a client or prospect"),
    (r"\b(share|forward)\b.*\b(client|customer|prospect|partner)s?\b", "Share with an external party"),
]


def detect_external_action(text: str) -> str | None:
    for pattern, label in _EXTERNAL:
        if re.search(pattern, text, re.IGNORECASE):
            return label
    return None


def derive_title(text: str) -> str:
    first = re.split(r"(?<=[.!?])\s", text.strip())[0].rstrip(".!?")
    first = re.sub(r"^(please|can you|could you|kindly)\s+", "", first, flags=re.IGNORECASE)
    title = first[:1].upper() + first[1:]
    return title if len(title) <= 72 else title[:69] + "…"
