#!/usr/bin/env bash
# =============================================================================
# ReconX Chat E2E Test Suite
#
# Tests the multi-agent chat architecture end-to-end via the /api/chat SSE
# endpoint.  Each test sends a message and validates the event stream.
#
# Prerequisites: server running on localhost:8001
# =============================================================================

BASE="http://localhost:8001"
PASS=0
FAIL=0
TOTAL=0

chat() {
  local msg="$1"
  local tid="$2"
  curl -s -N -X POST "$BASE/api/chat" \
    -H "Content-Type: application/json" \
    -d "{\"message\": \"$msg\", \"thread_id\": \"$tid\"}" 2>&1
}

assert_contains() {
  local label="$1"
  local output="$2"
  local pattern="$3"
  TOTAL=$((TOTAL + 1))
  if echo "$output" | grep -qi "$pattern"; then
    echo "  PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $label (expected '$pattern')"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_contains() {
  local label="$1"
  local output="$2"
  local pattern="$3"
  TOTAL=$((TOTAL + 1))
  if echo "$output" | grep -qi "$pattern"; then
    echo "  FAIL: $label (should NOT contain '$pattern')"
    FAIL=$((FAIL + 1))
  else
    echo "  PASS: $label"
    PASS=$((PASS + 1))
  fi
}

# =============================================================================
echo ""
echo "===== TEST 1: Greeting — supervisor responds directly ====="
OUT=$(chat "Hello, what can you do?" "t1-greeting")
assert_contains "Has token events" "$OUT" "event: token"
assert_contains "Ends with done" "$OUT" "event: done"
assert_not_contains "No error event" "$OUT" "event: error"

# =============================================================================
echo ""
echo "===== TEST 2: Data Analyst — list tables ====="
OUT=$(chat "List all tables in the database" "t2-tables")
assert_contains "Delegates to data analyst" "$OUT" "ask_data_analyst"
assert_contains "Ends with done" "$OUT" "event: done"
assert_not_contains "No error event" "$OUT" "event: error"

# =============================================================================
echo ""
echo "===== TEST 3: Data Analyst — SQL query ====="
OUT=$(chat "Show me the first 3 rows from DIM_FX_RATE" "t3-sql")
assert_contains "Delegates to data analyst" "$OUT" "ask_data_analyst"
assert_contains "Ends with done" "$OUT" "event: done"
assert_not_contains "No error event" "$OUT" "event: error"

# =============================================================================
echo ""
echo "===== TEST 4: Break report discovery (the critical fix) ====="
OUT=$(chat "What breaks were found in the last run?" "t4-breaks")
assert_contains "Delegates to regulatory expert" "$OUT" "ask_regulatory_expert"
# Should find the FR 2052a report (16 files exist)
assert_contains "Mentions breaks found" "$OUT" "break"
# Should NOT say 'no saved report' for fr2052a since reports exist
assert_not_contains "No false 'no report' for fr2052a" "$OUT" "No saved report found for fr2052a"
assert_contains "Ends with done" "$OUT" "event: done"
assert_not_contains "No error event" "$OUT" "event: error"

# =============================================================================
echo ""
echo "===== TEST 5: Specific break explanation ====="
OUT=$(chat "Explain break BRK-001 from the latest FR 2052a report" "t5-explain")
assert_contains "Delegates to regulatory expert" "$OUT" "ask_regulatory_expert"
assert_contains "Mentions BRK-001" "$OUT" "BRK-001"
assert_contains "Ends with done" "$OUT" "event: done"
assert_not_contains "No error event" "$OUT" "event: error"

# =============================================================================
echo ""
echo "===== TEST 6: Recon summary ====="
OUT=$(chat "Give me a summary of the latest FR 2052a reconciliation" "t6-summary")
assert_contains "Delegates to regulatory expert" "$OUT" "ask_regulatory_expert"
assert_contains "Mentions recon score" "$OUT" "score"
assert_contains "Ends with done" "$OUT" "event: done"

# =============================================================================
echo ""
echo "===== TEST 7: RAG — regulatory domain question ====="
OUT=$(chat "What are the HQLA haircut levels?" "t7-rag")
assert_contains "Delegates to regulatory expert" "$OUT" "ask_regulatory_expert"
assert_contains "Mentions HQLA levels" "$OUT" "level"
assert_contains "Ends with done" "$OUT" "event: done"

# =============================================================================
echo ""
echo "===== TEST 8: Pipeline operator — run reconciliation ====="
OUT=$(chat "Run the FR 2052a reconciliation for 2026-04-04" "t8-run")
assert_contains "Delegates to pipeline operator" "$OUT" "ask_pipeline_operator"
assert_contains "Ends with done" "$OUT" "event: done"
assert_not_contains "No error event" "$OUT" "event: error"

# =============================================================================
echo ""
echo "===== TEST 9: Token streaming — no raw content blocks ====="
OUT=$(chat "What is the recon score for the latest run?" "t9-clean")
# Tool results should NOT contain raw content block format
assert_not_contains "No raw content blocks" "$OUT" "content=\["
assert_contains "Ends with done" "$OUT" "event: done"

# =============================================================================
echo ""
echo "===== TEST 10: No internal tool leakage ====="
OUT=$(chat "How many tables are there?" "t10-leak")
EVENTS=$(echo "$OUT" | grep "^event:" | sort | uniq -c | sort -rn)
echo "  Event distribution:"
echo "$EVENTS" | sed 's/^/    /'
# Should only see ask_* tool events, not internal tools like list_tables
assert_not_contains "No leaked list_tables event" "$OUT" '"tool": "list_tables"'
assert_not_contains "No leaked query_database event" "$OUT" '"tool": "query_database"'
assert_contains "Ends with done" "$OUT" "event: done"

# =============================================================================
echo ""
echo "========================================="
echo "  RESULTS: $PASS passed, $FAIL failed, $TOTAL total"
echo "========================================="
echo ""

exit $FAIL
