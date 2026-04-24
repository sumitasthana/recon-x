"""FR 2052a scenario definitions.

Contract (shared with reports/fr2590/scenarios.py):

- `SCENARIOS` — ordered list of scenario IDs.
- `SCENARIO_CONFIGS` — dict keyed by scenario ID with data-injection knobs
  consumed by the synthetic data scaffolder. These values decide which
  breaks the synthetic data will EXPRESS, not which breaks the classifier
  is allowed to emit. The classifier derives breaks from actual state
  fields; scenario config shapes the data it observes.
"""

SCENARIOS = ["s1", "s2", "s3", "s4", "s5"]


# ---------------------------------------------------------------------------
# FR 2052a real schedule codes (per 12 CFR 249 filing instructions)
# ---------------------------------------------------------------------------
# The synthetic DuckDB + bundled target CSV use placeholder T1..T10 codes.
# We translate them to the 13 real filing schedules at extract time so the
# rest of the pipeline (compare / classify / UI) shows real codes. Three
# schedules (I.O, O.S, S.C) have no T-code source today — placeholders for
# when we expand the synthetic data.
FR2052A_SCHEDULE_CODES = [
    "I.A", "I.O", "I.S", "I.U",          # Inflows
    "O.D", "O.O", "O.S", "O.W",          # Outflows
    "S.L", "S.D", "S.I", "S.O", "S.C",   # Supplementals
]

# Product-driven mapping from synthetic T-codes to real schedules.
T_CODE_TO_SCHEDULE = {
    "T1":  "O.D",   # Deposits           → Outflows Deposits
    "T2":  "I.A",   # Securities         → Inflows Assets
    "T3":  "I.S",   # Repo               → Inflows Secured (reverse repo)
    "T4":  "I.U",   # Loans              → Inflows Unsecured
    "T5":  "O.W",   # EUR-tagged deposit → Outflows Wholesale (FX pool)
    "T6":  "S.D",   # FX Forwards        → Supplemental Derivatives
    "T7":  "S.L",   # Security (HQLA)    → Supplemental Liquidity
    "T8":  "S.I",   # Security (infoonly)→ Supplemental Informational
    "T9":  "O.O",   # Other deposit      → Outflows Other
    "T10": "S.O",   # Misc               → Supplemental Outstanding
}


def translate_table_counts(counts: dict) -> dict:
    """Rekey a {T-code: int} dict by real schedule codes, preserving unknowns."""
    out: dict = {}
    for k, v in counts.items():
        new_k = T_CODE_TO_SCHEDULE.get(k, k)
        out[new_k] = out.get(new_k, 0) + v
    return out


def translate_table_notionals(notionals: dict) -> dict:
    """Rekey a {T-code: float} dict by real schedule codes.

    DuckDB returns SUMs as `decimal.Decimal`; coerce to float so downstream
    arithmetic stays in the standard numeric tower.
    """
    out: dict = {}
    for k, v in notionals.items():
        new_k = T_CODE_TO_SCHEDULE.get(k, k)
        out[new_k] = out.get(new_k, 0.0) + float(v or 0.0)
    return out


SCENARIO_CONFIGS = {
    "s1": {"brk001_eur_count": 0,  "brk002_hqla_count": 0, "brk003_lei_count": 0,  "brk004_fwd_count": 0,  "eur_fx_rate": 1.0825, "eur_notional": 0},
    "s2": {"brk001_eur_count": 8,  "brk002_hqla_count": 0, "brk003_lei_count": 0,  "brk004_fwd_count": 0,  "eur_fx_rate": 1.0842, "eur_notional": 2_500_000},
    "s3": {"brk001_eur_count": 12, "brk002_hqla_count": 0, "brk003_lei_count": 12, "brk004_fwd_count": 11, "eur_fx_rate": 1.0842, "eur_notional": 3_200_000},
    "s4": {"brk001_eur_count": 20, "brk002_hqla_count": 8, "brk003_lei_count": 0,  "brk004_fwd_count": 0,  "eur_fx_rate": 1.0900, "eur_notional": 1_800_000},
    "s5": {"brk001_eur_count": 0,  "brk002_hqla_count": 0, "brk003_lei_count": 20, "brk004_fwd_count": 25, "eur_fx_rate": 1.0825, "eur_notional": 0},
}
