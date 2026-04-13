# FR 2590 Domain Reference

Reference tables for FR 2590 (Single-Counterparty Credit Limits) regulatory
reconciliation. Loaded on demand by agents that need regulatory context beyond
the core break taxonomy.

## Regulatory Overview

- **Report**: FR 2590 — Single-Counterparty Credit Limits Reporting Form
- **OMB Number**: 7100-0377
- **Authority**: Section 165(e) Dodd-Frank Act; 12 CFR Part 252 (Regulation YY)
- **Frequency**: Quarterly (as of Mar 31, Jun 30, Sep 30, Dec 31)
- **Submission deadline**: 40 calendar days after Q1-Q3; 45 calendar days after Q4
- **Respondents**: U.S. BHCs/SLHCs subject to Category I/II/III standards;
  FBOs with ≥$250B total consolidated assets or subject to Category II/III;
  U.S. IHCs subject to Category II/III standards
- **Confidentiality**: Non-public under FOIA exemption 4

## SCCL Limits

| Firm Type | Counterparty Type | Limit |
|---|---|---|
| G-SIB | Major counterparty (G-SIB or major FBO) | 15% of Tier 1 capital |
| G-SIB | Non-major counterparty | 25% of Tier 1 capital |
| Non-G-SIB covered company | Any counterparty | 25% of Tier 1 capital |
| Covered FBO (combined U.S. ops) | Major counterparty | 15% of capital stock & surplus |
| Covered FBO (combined U.S. ops) | Non-major counterparty | 25% of capital stock & surplus |
| U.S. IHC | Any counterparty | 25% of Tier 1 capital |

## Schedule Routing Rules

### General Information (Cover Page)
- Full legal name, LEI, Tier 1 capital, capital stock & surplus,
  total consolidated assets, major status, certification (FBOs)

### Schedule G-1: General Exposures
- **Scope**: 7 gross credit exposure categories per counterparty
- **Categories**:
  - (i) Deposits
  - (ii) Loans and leases
  - (iii) Debt securities or investments
  - (iv) Equity securities or investments
  - (v) Committed credit lines
  - (vi) Guarantees and letters of credit
  - (vii) Securitization arising from look-through approach
- **Output**: Total gross exposure per counterparty (sum of 7 categories)
- **Rows**: Top 50 counterparties ranked by aggregate gross credit exposure

### Schedule G-2: Repo/Reverse Repo Exposures
- **Scope**: Gross credit exposures from repurchase and reverse repurchase agreements
- **Detail**: Assets transferred and received (sovereign debt, non-sovereign debt,
  main index equities, cash)
- **Output**: Total gross exposure from repo transactions per counterparty

### Schedule G-3: Securities Lending/Borrowing Exposures
- **Scope**: Gross credit exposures from securities lending and borrowing
- **Detail**: Similar structure to G-2 for securities lending transactions
- **Output**: Total gross exposure from sec lending per counterparty

### Schedule G-4: Derivatives Exposures
- **Scope**: Gross notional and exposure from derivative transactions
- **Categories**: Interest rate, FX, credit, equity, commodity, other
- **Methods**:
  - SA-CCR (Standardized Approach for Counterparty Credit Risk) — default
  - CEM (Current Exposure Method) — legacy, being phased out
  - IMM (Internal Models Method) — requires Board approval
- **Netting**: Qualified master netting agreements reduce gross to net
- **Output**: Total gross exposure from derivatives per counterparty

### Schedule G-5: Risk Shifting Exposures
- **Scope**: Gross credit exposures arising from risk shifting of:
  - (i) Eligible collateral
  - (ii) Eligible guarantees
  - (iii) Eligible credit and equity derivatives
  - (iv) Other eligible hedges
  - (v) Unused portion of certain extensions of credit
  - (vi) Credit transactions involving excluded/exempt entities
- **Output**: Total gross exposure from risk shifting per counterparty
- **Constraint**: Columns (i)-(vi) must sum to total

### Schedule M-1: Eligible Collateral
- **Scope**: Credit risk mitigation from eligible collateral
- **Collateral types** (10 columns):
  - Sovereign debt
  - Non-sovereign debt
  - Main index equities
  - Other publicly traded equities
  - Cash
  - Gold
  - Other eligible collateral (4 sub-columns)
- **Output**: Total credit risk mitigation from collateral per counterparty

### Schedule M-2: General Risk Mitigants
- **Scope**: Credit risk mitigation from non-collateral sources
- **Categories**:
  - (i) Eligible guarantees
  - (ii) Eligible credit derivatives
  - (iii) Other eligible hedges
  - (iv) Unused portion of certain extensions of credit
  - (v) Credit transactions involving excluded/exempt entities
- **Output**: Total general risk mitigation per counterparty

### Summary of Net Credit Exposures
- **Calculation**:
  - Aggregate gross exposure = Sum(G-1 through G-5) per counterparty
  - Total credit risk mitigation = Sum(M-1 + M-2) per counterparty
  - Aggregate net credit exposure = Gross − Mitigation
  - Exposure ratio = Net exposure / Tier 1 capital (or capital stock & surplus)
- **Limit check**: Ratio must not exceed 25% (or 15% for G-SIB to major)

### Schedule A-1: Economic Interdependence
- **Scope**: Counterparties requiring aggregation due to economic interdependence
- **Factors**: Revenue dependence, shared guarantors, common funding sources,
  single-point-of-failure supply chains
- **Output**: Interconnected counterparty groups (up to 4 counterparties per group)

### Schedule A-2: Control Relationships
- **Scope**: Counterparties requiring aggregation due to control relationships
- **Factors**: ≥25% voting rights, board control, significant influence
- **Output**: Control-linked counterparty groups

## Exemptions and Exclusions

The following exposures are exempt from SCCL limits:

1. **U.S. Government**: Direct credit exposures to the U.S. government,
   including U.S. government agencies and Fannie Mae/Freddie Mac
   (while in conservatorship)
2. **Zero-risk-weight sovereigns**: Foreign sovereign entities assigned
   0% risk weight under Board capital rules
3. **Intraday exposures**: Credit exposures that are intraday only
4. **QCCP trade exposures**: Trade exposures to qualifying central
   counterparties
5. **Multilateral institutions**: BIS, IMF, World Bank
6. **European institutions**: European Commission, European Central Bank

## Counterparty Identification Rules

- Counterparties identified by LEI (ISO 17442, 20 alphanumeric characters)
- Subsidiaries defined per financial consolidation standard (US GAAP / IFRS)
- Affiliates of a counterparty must be aggregated as a single counterparty
- Economic interdependence test may require further aggregation (Schedule A-1)
- Control relationship test may require further aggregation (Schedule A-2)

## Exposure Calculation Methods

### SA-CCR (Default for derivatives)
- Replacement cost: RC = max(V − C, 0) for unmargined; max(V − C, TH + MTA − NICA, 0) for margined
- Potential future exposure: Based on asset class, notional, delta, maturity
- Alpha factor: 1.4 (regulatory constant)
- EAD = alpha × (RC + PFE)

### CEM (Legacy)
- Current exposure + potential future exposure add-on
- Add-on rates by asset class and residual maturity

### IMM (Requires Board approval)
- Internal model estimates of exposure at default
- Only advanced approaches firms may request

## Validation Rules (V-01 to V-12)

### Structural Validations
- V-01: Cover page fields complete (legal name, LEI, Tier 1 capital,
  capital stock & surplus, total consolidated assets, major status)
- V-02: LEI format — exactly 20 alphanumeric characters per ISO 17442
- V-03: Counterparty ordering consistent across all G and M schedules
- V-04: Exactly 50 counterparty rows populated (or fewer if <50 exist)

### Arithmetic Validations
- V-05: G-1 total = sum of 7 exposure category columns per row
- V-06: G-5 total = sum of 6 risk-shifting columns per row
- V-07: M-1 total = sum of 10 collateral columns per row
- V-08: M-2 total = sum of 5 risk mitigant columns per row
- V-09: Aggregate gross = Sum(G-1..G-5) per counterparty
- V-10: Aggregate net = Aggregate gross − Sum(M-1 + M-2) per counterparty

### Limit Validations
- V-11: Exposure ratio ≤ applicable limit (25% or 15%) for each counterparty
- V-12: If limit exceeded, temporary relief notice must be on file

## Reconciliation Tolerances

| Metric | Tolerance | Notes |
|---|---|---|
| Counterparty count | Exact match (50) | Same top-50 set required |
| Gross exposure per counterparty | < 0.5% | Per schedule |
| Net exposure per counterparty | < 0.5% | After netting/mitigation |
| Collateral valuation | < 1.0% | Haircut methodology may differ |
| Exposure ratio | < 0.1 ppt | Denominator must match |
| Netting set membership | Exact match | Per ISDA agreement |
| Exemption status | Exact match | Binary: exempt/non-exempt |
| Major status | Exact match | Binary: major/non-major |

## Recommended Actions by Break Type

### CPTY_HIERARCHY_MISMATCH
1. Compare counterparty-to-parent LEI mappings in source vs target
2. Verify economic interdependence factors (Schedule A-1 inputs)
3. Verify control relationship factors (Schedule A-2 inputs)
4. Check for stale corporate hierarchy reference data
5. Confirm subsidiary/affiliate definitions are consistent (US GAAP consolidation)

### NETTING_SET_DIVERGENCE
1. Compare ISDA master agreement scoping between systems
2. Verify cross-product netting election flags
3. Check CSA/CSD reference data freshness
4. Validate SA-CCR vs CEM method consistency
5. Confirm qualified master netting agreement status

### COLLATERAL_ELIGIBILITY_DRIFT
1. Compare collateral type classification between systems
2. Verify haircut schedules (sovereign vs non-sovereign vs equity)
3. Check for stale collateral eligibility reference data
4. Confirm gold and cash treatment consistency
5. Validate main index equity list alignment

### EXEMPT_ENTITY_MISCLASS
1. Verify counterparty legal entity type classification
2. Check sovereign risk weight assignment (0% qualification)
3. Confirm QCCP designation and current qualifying status
4. Validate GSE conservatorship status (Fannie Mae, Freddie Mac)
5. Cross-reference exemption list against Fed-published eligible entities
