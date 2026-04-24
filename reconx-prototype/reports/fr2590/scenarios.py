"""FR 2590 SCCL scenario definitions.

Contract (shared with reports/fr2052a/scenarios.py):

- `SCENARIOS` — ordered list of scenario IDs.
- `SCENARIO_CONFIGS` — dict keyed by scenario ID with data-injection knobs
  consumed by the synthetic data scaffolder. Values shape the data the
  classifier observes; they do NOT gate which breaks the classifier emits.
- `SCENARIO_SOURCE_CONFIG` / `SCENARIO_TARGET_CONFIG` — scenario-specific
  source/target data profiles (seeds, multipliers, per-scenario target
  payloads) consumed by reports/fr2590/data_scaffold.py.
- `SCENARIO_BREAK_GATE` — post-classification filter per scenario.
  Because FR 2590 shares a single XML/log across runs, structural breaks
  would otherwise fire on every scenario. The gate suppresses break IDs
  per scenario so each run produces a distinct profile.
"""

SCENARIOS = ["s1", "s2", "s3", "s4", "s5"]


# Top-level SCENARIO_CONFIGS — mirrors the FR 2052a contract. For FR 2590
# the knobs describe source-side multipliers; see SCENARIO_SOURCE_CONFIG
# for the full data-injection payload consumed by data_scaffold.
SCENARIO_CONFIGS = {
    sid: {
        "seed": seed,
        "source_multiplier": mult,
        "g4_bias": g4_bias,
    }
    for sid, seed, mult, g4_bias in [
        ("s1", 11, 1.00, 1.00),  # clean
        ("s2", 22, 0.92, 0.85),  # modest divergence
        ("s3", 33, 1.00, 0.92),  # multi-break default
        ("s4", 44, 0.80, 0.55),  # CEM-vs-SA-CCR, big G-4 delta
        ("s5", 55, 0.95, 1.05),  # silent-heavy, small G-4 delta
    ]
}


# Detailed source-side knobs for the synthetic scaffolder.
SCENARIO_SOURCE_CONFIG = {
    "s1": {"seed": 11, "mult": 1.00, "g4_bias": 1.00},
    "s2": {"seed": 22, "mult": 0.92, "g4_bias": 0.85},
    "s3": {"seed": 33, "mult": 1.00, "g4_bias": 0.92},
    "s4": {"seed": 44, "mult": 0.80, "g4_bias": 0.55},
    "s5": {"seed": 55, "mult": 0.95, "g4_bias": 1.05},
}


# Per-scenario target-JSON payloads produced by the data scaffolder.
_NETTING_SETS = [
    "NS-ISDA-JPM-001", "NS-ISDA-GS-001", "NS-ISDA-BAC-001",
    "NS-ISDA-WF-001", "NS-ISDA-CITI-001", "NS-ISDA-MS-001",
    "NS-ISDA-DB-001", "NS-ISDA-UBS-001", "NS-ISDA-CS-001",
    "NS-ISDA-BARC-001", "NS-ISDA-BNP-001", "NS-ISDA-HSBC-001",
]

SCENARIO_TARGET_CONFIG = {
    "s1": {
        "table_counts": {"G-1": 50, "G-2": 34, "G-3": 30, "G-4": 48, "G-5": 24, "M-1": 42, "M-2": 36},
        "table_notionals": {
            "G-1": 42_000_000_000.0, "G-2": 17_000_000_000.0, "G-3": 11_500_000_000.0,
            "G-4": 29_000_000_000.0, "G-5": 7_800_000_000.0,
            "M-1": 24_000_000_000.0, "M-2": 14_500_000_000.0,
        },
        "netting_set_ids": _NETTING_SETS,
        "netting_divergences": 0,
        "collateral_drifts": 0,
        "exemption_misclassifications": 0,
        "total_counterparties": 15,
    },
    "s2": {
        "table_counts": {"G-1": 47, "G-2": 31, "G-3": 27, "G-4": 44, "G-5": 21, "M-1": 39, "M-2": 34},
        "table_notionals": {
            "G-1": 40_000_000_000.0, "G-2": 16_000_000_000.0, "G-3": 11_000_000_000.0,
            "G-4": 33_000_000_000.0, "G-5": 7_500_000_000.0,
            "M-1": 23_000_000_000.0, "M-2": 14_000_000_000.0,
        },
        "netting_set_ids": _NETTING_SETS[:-1],
        "netting_divergences": 1,
        "collateral_drifts": 0,
        "exemption_misclassifications": 0,
        "total_counterparties": 14,
    },
    "s3": {
        "table_counts": {"G-1": 48, "G-2": 32, "G-3": 28, "G-4": 45, "G-5": 22, "M-1": 40, "M-2": 35},
        "table_notionals": {
            "G-1": 45_000_000_000.0, "G-2": 18_000_000_000.0, "G-3": 12_000_000_000.0,
            "G-4": 38_000_000_000.0, "G-5": 8_000_000_000.0,
            "M-1": 25_000_000_000.0, "M-2": 15_000_000_000.0,
        },
        "netting_set_ids": _NETTING_SETS,
        "netting_divergences": 1,
        "collateral_drifts": 1,
        "exemption_misclassifications": 1,
        "total_counterparties": 15,
    },
    "s4": {
        "table_counts": {"G-1": 46, "G-2": 30, "G-3": 26, "G-4": 43, "G-5": 20, "M-1": 38, "M-2": 33},
        "table_notionals": {
            "G-1": 44_000_000_000.0, "G-2": 17_500_000_000.0, "G-3": 11_800_000_000.0,
            "G-4": 51_000_000_000.0, "G-5": 7_900_000_000.0,
            "M-1": 24_500_000_000.0, "M-2": 14_700_000_000.0,
        },
        "netting_set_ids": _NETTING_SETS[:-2],
        "netting_divergences": 2,
        "collateral_drifts": 0,
        "exemption_misclassifications": 0,
        "total_counterparties": 14,
    },
    "s5": {
        "table_counts": {"G-1": 44, "G-2": 28, "G-3": 24, "G-4": 41, "G-5": 18, "M-1": 36, "M-2": 31},
        "table_notionals": {
            "G-1": 41_000_000_000.0, "G-2": 16_500_000_000.0, "G-3": 11_200_000_000.0,
            "G-4": 35_500_000_000.0, "G-5": 7_200_000_000.0,
            "M-1": 23_500_000_000.0, "M-2": 14_200_000_000.0,
        },
        "netting_set_ids": _NETTING_SETS,
        "netting_divergences": 0,
        "collateral_drifts": 1,
        "exemption_misclassifications": 3,
        "total_counterparties": 13,
    },
}


# Post-classification filter — which break IDs to skip per scenario so
# each scenario produces a distinct break profile and score spread.
SCENARIO_BREAK_GATE = {
    "s1": {"BRK-001", "BRK-002", "BRK-003", "BRK-004",
           "BRK-S01", "BRK-S02", "BRK-S04"},                      # clean — no break-category penalties (~75)
    "s2": {"BRK-001", "BRK-003", "BRK-004",
           "BRK-S02", "BRK-S04"},                                  # netting + exposure-method only (~40)
    "s3": set(),                                                   # default — all breaks fire (floors to 0)
    "s4": {"BRK-003", "BRK-004", "BRK-S04"},                       # hierarchy + netting + CEM-exposure dominant (~15)
    "s5": {"BRK-001", "BRK-002", "BRK-S01", "BRK-S02"},            # exemption + collateral + silent (~45)
}
