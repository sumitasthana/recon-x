"""FR 2590 Single-Counterparty Credit Limits plugin."""

import os
from core.state import ReconState
from reports.base import ReportPlugin
from reports.fr2590.extract_source import extract_source_node as _extract_source
from reports.fr2590.extract_target import extract_target_node as _extract_target
from reports.fr2590.classify import classify_node as _classify


class FR2590Plugin(ReportPlugin):

    @property
    def report_id(self) -> str:
        return "fr2590"

    @property
    def display_name(self) -> str:
        return "FR 2590 SCCL"

    @property
    def description(self) -> str:
        return "Single-Counterparty Credit Limits — quarterly filing to the Federal Reserve"

    def extract_source_node(self, state: ReconState) -> dict:
        return _extract_source(state)

    def extract_target_node(self, state: ReconState) -> dict:
        return _extract_target(state)

    def classify_node(self, state: ReconState) -> dict:
        return _classify(state)

    def skill_path(self) -> str:
        return os.path.join(os.path.dirname(__file__), "skill", "SKILL.md")

    def steps_metadata(self) -> list[dict]:
        return [
            {
                "id": "step1",
                "label": "Reading source exposures",
                "subtitle": "Counterparty credit data warehouse",
                "skills": ["snowflake", "client"],
                "messages": [
                    {"text": "Connecting to source data warehouse", "delay": 0},
                    {"text": "Loading client-specific table mappings", "delay": 900, "skill": "client"},
                    {"text": "Extracting top-50 counterparty exposures across 5 general schedules (G-1..G-5)", "delay": 1800, "skill": "snowflake"},
                    {"text": "Loading counterparty hierarchy — parent LEI mappings for aggregation", "delay": 2800},
                    {"text": "Capturing netting set definitions from ISDA master agreements", "delay": 3500},
                    {"text": "Loading collateral eligibility and haircut schedules", "delay": 4200},
                    {"text": "Flagging exempt entities (sovereigns, QCCPs, GSEs)", "delay": 4800},
                    {"text": "Source extraction complete — 50 counterparties, 5 schedules", "delay": 5500},
                ],
            },
            {
                "id": "step2",
                "label": "Reading target system",
                "subtitle": "Regulatory engine output",
                "skills": ["axiomsl", "client"],
                "messages": [
                    {"text": "Loading client-specific file locations", "delay": 0, "skill": "client"},
                    {"text": "Parsing regulatory engine output — Schedule G and M data", "delay": 1000, "skill": "axiomsl"},
                    {"text": "Extracting counterparty parent mappings from target hierarchy", "delay": 1800},
                    {"text": "Loading netting set boundaries from target derivatives processing", "delay": 2600, "skill": "axiomsl"},
                    {"text": "Extracting collateral mitigation amounts (Schedule M-1, M-2)", "delay": 3400, "skill": "axiomsl"},
                    {"text": "Loading exemption classifications and limit calculations", "delay": 4200},
                    {"text": "Target extraction complete — computing aggregate net exposures", "delay": 5000},
                ],
            },
            {
                "id": "step3",
                "label": "Comparing exposures",
                "subtitle": "Counterparty-level reconciliation",
                "skills": [],
                "messages": [
                    {"text": "No specialized knowledge needed — pure number comparison", "delay": 0},
                    {"text": "Comparing counterparty counts: source vs target top-50 sets", "delay": 1200},
                    {"text": "Schedule-level gross exposure deltas (G-1 through G-5)", "delay": 2200},
                    {"text": "Netting set membership comparison per counterparty", "delay": 3200},
                    {"text": "Collateral haircut delta analysis (M-1, M-2)", "delay": 4000},
                    {"text": "Exemption status comparison — exempt vs non-exempt flags", "delay": 4600},
                    {"text": "Aggregate net exposure and limit ratio comparison", "delay": 5000},
                    {"text": "Comparison complete — anomaly signals identified", "delay": 5500},
                ],
            },
            {
                "id": "step4",
                "label": "Classifying breaks",
                "subtitle": "SCCL exposure analysis",
                "skills": ["regulatory"],
                "messages": [
                    {"text": "Loading FR 2590 SCCL regulatory knowledge", "delay": 0, "skill": "regulatory"},
                    {"text": "Sending anomaly evidence to AI analyst for classification", "delay": 1200},
                    {"text": "Analyzing: counterparty hierarchy divergence — aggregation group mismatches", "delay": 2400, "skill": "regulatory"},
                    {"text": "Analyzing: netting set boundary differences — ISDA scoping discrepancies", "delay": 3200, "skill": "regulatory"},
                    {"text": "Analyzing: collateral eligibility drift — haircut divergence on asset classes", "delay": 4000, "skill": "regulatory"},
                    {"text": "Analyzing: exempt entity misclassification — sovereign/QCCP status conflicts", "delay": 4800, "skill": "regulatory"},
                    {"text": "SCCL breaks classified with severity and limit impact", "delay": 5400},
                    {"text": "Reconciliation score calculated", "delay": 5800},
                ],
            },
        ]

    def context_metadata(self) -> dict:
        return {
            "report_name": "FR 2590",
            "report_full_name": "FR 2590 Single-Counterparty Credit Limits",
            "filing_frequency": "Quarterly",
            "regulator": "Federal Reserve",
            "source_systems": [
                {"name": "Credit Risk Engine", "assets": "Counterparty exposures, limits"},
                {"name": "Derivatives Platform", "assets": "OTC derivatives, netting sets"},
                {"name": "Collateral Mgmt", "assets": "Eligible collateral, haircuts"},
                {"name": "Entity Master", "assets": "LEI hierarchy, exemption status"},
                {"name": "Repo/SecLending", "assets": "Repo and securities lending positions"},
            ],
            "target_processing": [
                {"label": "Counterparty aggregation", "desc": "parent/subsidiary hierarchy"},
                {"label": "Netting computation", "desc": "ISDA master agreement scoping"},
                {"label": "Collateral mitigation", "desc": "eligible collateral haircuts"},
                {"label": "Exposure calculation", "desc": "SA-CCR for derivatives"},
                {"label": "Limit check", "desc": "25%/15% of Tier 1 capital"},
            ],
            "tables": [
                {"code": "G-1", "name": "General exposures", "category": "exposure"},
                {"code": "G-2", "name": "Repo/reverse repo", "category": "exposure"},
                {"code": "G-3", "name": "Sec lending/borrowing", "category": "exposure"},
                {"code": "G-4", "name": "Derivatives", "category": "exposure"},
                {"code": "G-5", "name": "Risk shifting", "category": "exposure"},
                {"code": "M-1", "name": "Eligible collateral", "category": "mitigation"},
                {"code": "M-2", "name": "General mitigants", "category": "mitigation"},
                {"code": "A-1", "name": "Econ interdependence", "category": "aggregation"},
                {"code": "A-2", "name": "Control relationships", "category": "aggregation"},
            ],
            "skills": [
                {
                    "id": "regulatory",
                    "label": "FR 2590 SCCL Knowledge",
                    "tier": "Domain",
                    "desc": "SCCL limits (25%/15%), SA-CCR exposure methods, netting rules, exemption criteria, validation rules V-01 to V-12",
                },
                {
                    "id": "snowflake",
                    "label": "Source System Intelligence",
                    "tier": "Platform",
                    "desc": "Knows how to read from Snowflake — counterparty hierarchy, netting sets, collateral records",
                },
                {
                    "id": "axiomsl",
                    "label": "Target System Intelligence",
                    "tier": "Platform",
                    "desc": "Knows how to read regulatory engine — schedule outputs, limit calculations, exemption flags",
                },
                {
                    "id": "client",
                    "label": "Client Configuration",
                    "tier": "Client",
                    "desc": "Client-specific counterparty mappings, netting agreements, capital denominators",
                },
            ],
        }


# Auto-register on import
import reports
reports.register(FR2590Plugin())
