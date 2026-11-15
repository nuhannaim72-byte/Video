"""Authorised company datasets and knowledge-base articles available to the agents.

These are DEMO records so the platform works out of the box. Replace them with real, approved
sources (finance system extracts, CRM, HR system) before production use. Every dataset carries
`demo: True` so agents state that figures are illustrative.
"""

DATASETS: dict[str, dict] = {
    "finance.monthly_pnl": {
        "description": "Monthly revenue, cost of sales and operating costs by service line (GBP).",
        "demo": True,
        "columns": ["month", "service_line", "revenue", "cost_of_sales", "operating_costs"],
        "rows": [
            ["2026-07", "BI & Analytics", 412000, 228000, 61000],
            ["2026-07", "Data Engineering", 318000, 190000, 47000],
            ["2026-07", "Digital Transformation", 276000, 171000, 44000],
            ["2026-07", "Strategy & Advisory", 162000, 79000, 26000],
            ["2026-08", "BI & Analytics", 431000, 236000, 62000],
            ["2026-08", "Data Engineering", 329000, 195000, 48000],
            ["2026-08", "Digital Transformation", 262000, 168000, 44000],
            ["2026-08", "Strategy & Advisory", 171000, 82000, 26000],
            ["2026-09", "BI & Analytics", 447000, 241000, 63000],
            ["2026-09", "Data Engineering", 336000, 199000, 49000],
            ["2026-09", "Digital Transformation", 281000, 173000, 45000],
            ["2026-09", "Strategy & Advisory", 168000, 80000, 27000],
        ],
    },
    "finance.cash_position": {
        "description": "Month-end cash, receivables and payables (GBP).",
        "demo": True,
        "columns": ["month", "closing_cash", "receivables", "payables", "debtor_days"],
        "rows": [
            ["2026-07", 1480000, 912000, 401000, 47],
            ["2026-08", 1562000, 884000, 389000, 45],
            ["2026-09", 1655000, 861000, 412000, 44],
        ],
    },
    "finance.budget_vs_actual": {
        "description": "Year-to-date budget versus actual by cost centre (GBP).",
        "demo": True,
        "columns": ["cost_centre", "budget_ytd", "actual_ytd"],
        "rows": [
            ["Delivery", 5120000, 5034000],
            ["Sales & Marketing", 640000, 668000],
            ["Technology", 410000, 396000],
            ["People & Admin", 520000, 512000],
        ],
    },
    "crm.pipeline": {
        "description": "Open opportunities with stage, value and probability.",
        "demo": True,
        "columns": ["opportunity", "client", "stage", "value_gbp", "probability"],
        "rows": [
            ["Analytics platform tender", "Public sector prospect", "Proposal", 640000, 0.55],
            ["BI rollout wave 3", "Healthcare client", "Negotiation", 280000, 0.75],
            ["Invoice automation phase 2", "Logistics client", "Qualified", 190000, 0.4],
            ["Lakehouse migration", "Manufacturing client", "Lead", 520000, 0.2],
        ],
    },
    "clients.health": {
        "description": "Account health: CSAT, NPS, open tickets, renewal date.",
        "demo": True,
        "columns": ["client", "csat", "nps", "open_tickets", "renewal"],
        "rows": [
            ["Healthcare client", 4.8, 64, 3, "2027-03"],
            ["Logistics client", 4.5, 51, 6, "2027-01"],
            ["Manufacturing client", 4.7, 60, 2, "2027-06"],
            ["Retail client", 4.2, 38, 9, "2026-12"],
        ],
    },
    "projects.status": {
        "description": "Engagement status: milestones, RAG rating, budget burn.",
        "demo": True,
        "columns": ["project", "client", "rag", "milestones_done", "milestones_total", "budget_burn"],
        "rows": [
            ["ERP data migration", "Manufacturing client", "Amber", 7, 13, 0.58],
            ["BI rollout wave 2", "Healthcare client", "Green", 11, 14, 0.71],
            ["Invoice automation", "Logistics client", "Green", 6, 9, 0.64],
            ["Growth strategy", "Retail client", "Green", 4, 6, 0.6],
        ],
    },
    "people.headcount": {
        "description": "Headcount by practice and onboarding status (no personal data).",
        "demo": True,
        "columns": ["practice", "headcount", "onboarding_in_progress"],
        "rows": [
            ["BI & Analytics", 9, 1],
            ["Data Engineering", 7, 1],
            ["Digital Transformation", 6, 0],
            ["Strategy", 5, 0],
            ["Operations", 4, 1],
        ],
    },
}

KNOWLEDGE: list[dict] = [
    {
        "id": "kb-approvals",
        "title": "Approval policy",
        "content": "All client-facing deliverables are reviewed by the Managing Director before release. Any external action — sending email, publishing content, submitting proposals, signing documents, making payments — requires a separate explicit approval and is logged in the audit trail.",
    },
    {
        "id": "kb-reporting",
        "title": "Financial reporting standards",
        "content": "Management reports present revenue, gross margin, operating costs, cash and debtor days, compare actuals with budget, and explain variances above 5%. Figures are in GBP. State the data sources and the period covered.",
    },
    {
        "id": "kb-delivery",
        "title": "HN.CO delivery method",
        "content": "Engagements follow discover, design, build and adopt phases. Every engagement has a RAID log, a weekly status report and a steering group. BI work starts from a KPI framework agreed with the client sponsor.",
    },
    {
        "id": "kb-data",
        "title": "Data handling",
        "content": "Agents only use authorised company datasets and the knowledge base. Personal data is minimised. Client data never leaves the client's tenant without written agreement.",
    },
    {
        "id": "kb-brand",
        "title": "Brand voice",
        "content": "HN.CO writes in plain, confident British English. Lead with the insight, support with evidence, end with a recommendation. Tagline: Intelligence Behind Every Transformation.",
    },
]
