# Domain Skill: FR 2052a

FR 2052a regulatory semantics and break classification rules.

NOTE: This skill contains NO table names. Table names come from client_schema configuration.

## Table Routing Rules (T1-T10)

- **T1 (Cash Inflows/Outflows)**: Unsecured deposits, cash positions
- **T2 (Secured Lending/Borrowing)**: Repo, reverse repo, securities lending
- **T3 (Short-Term Securities)**: CP, CDs, bills
- **T4 (Loans)**: Term loans, revolving credit facilities
- **T5 (Retail Cash Flows)**: Retail deposits, credit cards
- **T6 (Derivatives/Fx)**: FX forwards, swaps, options
- **T7 (Collateral)**: Margin, posted/received collateral
- **T8 (Interbank)**: Interbank placements, fed funds
- **T9 (Other Inflows)**: Non-operational inflows
- **T10 (Other Outflows)**: Non-operational outflows

## Break Classification Types

### BRK-001: Mismatched Counterparty LEI
- **Category**: DATA_GAP
- **Severity**: HIGH
- **Detection**: Source has LEI, target missing or different
- **Impact**: Counterparty risk misclassification

### BRK-002: Unmapped Product/CUSIP
- **Category**: DATA_GAP
- **Severity**: HIGH
- **Detection**: HQLA-eligible product marked as non-HQLA
- **Impact**: Liquidity coverage ratio distortion

### BRK-003: Stale Counterparty Reference
- **Category**: DATA_GAP
- **Severity**: MEDIUM
- **Detection**: LEI not synced with AxiomSL counterparty master
- **Impact**: Affiliation flag incorrect

### BRK-004: FX Forward Maturity Handling
- **Category**: FX_MISMATCH
- **Severity**: HIGH
- **Detection**: forward_start_flag=TRUE but forward_start_date IS NULL
- **Impact**: Wrong maturity bucket assignment
- **Table**: T6 (Derivatives)

### FX-001: Rate Divergence
- **Category**: FX_MISMATCH
- **Severity**: MEDIUM
- **Detection**: Source FX rate differs from target by >0.1%
- **Impact**: Notional USD conversion errors

### HQLA-001: Level Degradation
- **Category**: HQLA_DEGRADATION
- **Severity**: HIGH
- **Detection**: Source Level 1/2, target Level 3/4 or non-HQLA
- **Impact**: LCR haircut increase

### SILENT-001: Invisible Position Loss
- **Category**: SILENT_FILTER
- **Severity**: CRITICAL
- **Detection**: Positions excluded by SILENT ingestion filter
- **Impact**: Complete data loss, no audit trail in AxiomSL logs

## HQLA Classification Rules

### Level 1 (0% haircut)
- Central bank reserves
- Sovereign bonds (AAA-AA-)
- US Treasuries
- EEA government bonds

### Level 2A (15% haircut)
- Sovereign bonds (A- to BBB-)
- Supranational bonds
- US agency debt

### Level 2B (25-50% haircut)
- Investment grade corporate bonds
- Certain equities
- Gold

### Non-HQLA
- Private label MBS
- Sub-investment grade bonds
- Illiquid assets

## FX Rate Alignment Rules

- Primary sources: ECB fixing, BOE fixing, Bloomberg BFIX
- Tolerance: 0.1% for EUR/USD, GBP/USD; 0.2% for others
- Cross-rate calculation: Must use same time stamp

## Validation Rules (V-01 to V-17)

### Structural Validations
- V-01: Required fields populated
- V-02: Date formats consistent
- V-03: Currency codes ISO 4217
- V-04: LEI format 20 characters

### Business Validations
- V-05: Notional amount > 0
- V-06: Maturity date > report date
- V-07: FX rate within valid range
- V-08: HQLA flag consistent with product type

### Reconciliation Validations
- V-09: Source-to-target row count variance < 1%
- V-10: Notional delta < 0.5%
- V-11: FX rate delta < 0.1%
- V-12: Table assignment coverage 100%

## Maturity Buckets

- Overnight: <= 1 day
- 2-7 days
- 8-30 days
- 31-90 days
- 91-180 days
- 181-365 days
- > 1 year
- Open maturity (no maturity date)

## Recommended Actions by Break Type

### DATA_GAP
1. Investigate source system record
2. Check ETL mapping logic
3. Validate counterparty master sync

### FX_MISMATCH
1. Compare rate sources (ECB vs AxiomSL)
2. Check timestamp alignment
3. Validate cross-rate calculation

### HQLA_DEGRADATION
1. Review HQLA reference data refresh
2. Check CUSIP mapping
3. Validate eligibility rules

### SILENT_FILTER
1. Review ingestion filter configuration
2. Extract excluded positions from source
3. Assess if exclusion is justified

## Recon Scoring Formula

```
Base Score: 100.0
- Row delta > 0: -10 points
- Notional delta > 1%: -15 points
- Silent filter > 0: -25 points
- HQLA downgrade > 0: -20 points
- Missing LEI > 0: -5 points per LEI
- Orphan positions > 0: -10 points

Minimum score: 0.0
```
