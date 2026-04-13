"""FR 2052a Liquidity Report plugin."""

import os
from core.state import ReconState
from reports.base import ReportPlugin
from reports.fr2052a.extract_source import extract_source_node as _extract_source
from reports.fr2052a.extract_target import extract_target_node as _extract_target
from reports.fr2052a.classify import classify_node as _classify


class FR2052aPlugin(ReportPlugin):

    @property
    def report_id(self) -> str:
        return "fr2052a"

    @property
    def display_name(self) -> str:
        return "FR 2052a Liquidity"

    @property
    def description(self) -> str:
        return "Complex Institution Liquidity Monitoring Report — daily filing to the Federal Reserve"

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
                "label": "Reading source data",
                "subtitle": "Snowflake data warehouse",
                "skills": ["snowflake", "client"],
                "messages": [
                    {"text": "Connecting to source data warehouse", "delay": 0},
                    {"text": "Loading client-specific table mappings", "delay": 900, "skill": "client"},
                    {"text": "Reading 500 liquidity positions across 10 reporting tables", "delay": 1800, "skill": "snowflake"},
                    {"text": "Capturing FX rates — Bloomberg end-of-day: EUR 1.0842, GBP 1.2648", "delay": 2800},
                    {"text": "Identifying 3 HQLA-eligible securities", "delay": 3500},
                    {"text": "Flagging 11 FX forward contracts with missing settlement dates", "delay": 4200},
                    {"text": "Source extraction complete — 500 positions captured", "delay": 5000},
                ],
            },
            {
                "id": "step2",
                "label": "Reading target system",
                "subtitle": "AxiomSL regulatory engine",
                "skills": ["axiomsl", "client"],
                "messages": [
                    {"text": "Loading client-specific file locations", "delay": 0, "skill": "client"},
                    {"text": "Parsing application logs — extracting processing events", "delay": 1000, "skill": "axiomsl"},
                    {"text": "Found warning: 12 positions excluded due to unmapped counterparties", "delay": 1800},
                    {"text": "Reading system configuration files — 5 config modules detected", "delay": 2600, "skill": "axiomsl"},
                    {"text": "Discovered silent exclusion filter — no log entries generated for affected positions", "delay": 3400, "skill": "axiomsl"},
                    {"text": "HQLA reference table last updated December 2025 — 4 months stale", "delay": 4200},
                    {"text": "FX rates used: ECB prior-day reference — EUR 1.0831 (differs from source)", "delay": 4800},
                    {"text": "Target extraction complete — 477 positions loaded, 23 excluded", "delay": 5500},
                ],
            },
            {
                "id": "step3",
                "label": "Comparing positions",
                "subtitle": "Arithmetic reconciliation",
                "skills": [],
                "messages": [
                    {"text": "No specialized knowledge needed — pure number comparison", "delay": 0},
                    {"text": "Row gap: 500 source vs 477 target = 23 missing positions", "delay": 1200},
                    {"text": "FX rate divergence: EUR 1.0842 vs 1.0831 = 0.10% gap", "delay": 2200},
                    {"text": "Estimated notional impact: €1.27B book × 0.0011 delta ≈ $1.4M variance", "delay": 3200},
                    {"text": "11 positions have zero trace in target logs — invisible exclusion", "delay": 4000},
                    {"text": "Position coverage: 95.4% — well below 99.5% alert threshold", "delay": 4600},
                    {"text": "No orphan positions found (nothing in target missing from source)", "delay": 5000},
                    {"text": "Comparison complete — 4 anomaly signals identified", "delay": 5500},
                ],
            },
            {
                "id": "step4",
                "label": "Classifying breaks",
                "subtitle": "AI-powered root cause analysis",
                "skills": ["regulatory"],
                "messages": [
                    {"text": "Loading FR 2052a regulatory knowledge", "delay": 0, "skill": "regulatory"},
                    {"text": "Sending anomaly evidence to AI analyst for classification", "delay": 1200},
                    {"text": "Analyzing: FX rate source divergence between systems since March 2026 config change", "delay": 2400, "skill": "regulatory"},
                    {"text": "Analyzing: HQLA reference data is 4 months stale — 3 securities affected", "delay": 3200, "skill": "regulatory"},
                    {"text": "Analyzing: 2 new counterparties onboarded in source but not synced to target", "delay": 4000, "skill": "regulatory"},
                    {"text": "Analyzing: silent filter is excluding 11 positions the Fed requires to be reported", "delay": 4800, "skill": "regulatory"},
                    {"text": "4 regulatory breaks classified with severity and impact", "delay": 5400},
                    {"text": "Reconciliation score calculated: 60 / 100", "delay": 5800},
                ],
            },
        ]

    def context_metadata(self) -> dict:
        return {
            "report_name": "FR 2052a",
            "report_full_name": "FR 2052a Liquidity Report",
            "filing_frequency": "Daily",
            "regulator": "Federal Reserve",
            "source_systems": [
                {"name": "Murex", "assets": "Derivatives, Repos"},
                {"name": "Calypso", "assets": "Fixed income, Equities"},
                {"name": "Summit", "assets": "FX spot/forward"},
                {"name": "Kondor+", "assets": "Money market, Funding"},
                {"name": "Loan IQ", "assets": "Loans, Credit facilities"},
            ],
            "target_processing": [
                {"label": "Ingestion filters", "desc": "include/exclude positions"},
                {"label": "FX re-conversion", "desc": "ECB reference rates"},
                {"label": "HQLA validation", "desc": "eligibility checks"},
                {"label": "Product routing", "desc": "assigns to 10 tables"},
            ],
            "tables": [
                {"code": "T1", "name": "Inflows unsecured", "category": "inflow"},
                {"code": "T2", "name": "Inflows secured", "category": "inflow"},
                {"code": "T3", "name": "Outflows secured", "category": "outflow"},
                {"code": "T4", "name": "Deposits", "category": "outflow"},
                {"code": "T5", "name": "Derivatives", "category": "supplemental"},
                {"code": "T6", "name": "FX forwards", "category": "supplemental"},
                {"code": "T7", "name": "Collateral", "category": "supplemental"},
                {"code": "T8", "name": "Assets", "category": "balance"},
                {"code": "T9", "name": "Funding", "category": "balance"},
                {"code": "T10", "name": "Contingent", "category": "balance"},
            ],
            "skills": [
                {
                    "id": "regulatory",
                    "label": "FR 2052a Regulatory Knowledge",
                    "tier": "Domain",
                    "desc": "Fed liquidity rules, HQLA eligibility, table routing, maturity bucketing, 17 validation rules",
                },
                {
                    "id": "snowflake",
                    "label": "Source System Intelligence",
                    "tier": "Platform",
                    "desc": "Knows how to read from Snowflake — schema structure, query patterns, data quality checks",
                },
                {
                    "id": "axiomsl",
                    "label": "Target System Intelligence",
                    "tier": "Platform",
                    "desc": "Knows how to read AxiomSL — configuration files, application logs, ingestion filter behavior",
                },
                {
                    "id": "client",
                    "label": "Client Configuration",
                    "tier": "Client",
                    "desc": "Maps generic capabilities to BHC-Alpha's specific systems — swap this file, onboard a new client",
                },
            ],
        }


# Auto-register on import
import reports
reports.register(FR2052aPlugin())
