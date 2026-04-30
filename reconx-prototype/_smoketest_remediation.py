import sys
sys.path.insert(0, ".")
from api.server import _validate_remediation_sql, apply_sql, ApplySqlRequest, create_jira, CreateJiraRequest, push_mapping, PushMappingRequest, remediation_audit

print("--- SQL validation ---")
for ok in ["UPDATE foo SET x=1 WHERE break_id='BRK-001'",
           "-- header\nINSERT INTO foo VALUES (1)"]:
    print("OK :", _validate_remediation_sql(ok))
for bad in ["DELETE FROM foo", "DROP TABLE foo",
            "UPDATE foo SET x=1; DROP TABLE bar", "SELECT 1"]:
    try:
        _validate_remediation_sql(bad)
        print("MISS:", bad)
    except ValueError as e:
        print("REJ :", bad, "->", e)

print()
print("--- create_jira dry_run ---")
print(create_jira(CreateJiraRequest(break_id="BRK-TEST", summary="Test", details="details", break_type="TEST", priority="Low", confirm=False)))

print()
print("--- create_jira commit ---")
print(create_jira(CreateJiraRequest(break_id="BRK-TEST", summary="Test", details="details", break_type="TEST", priority="Low", confirm=True)))

print()
print("--- push_mapping dry_run ---")
print(push_mapping(PushMappingRequest(break_id="BRK-TEST", report_form="FR2052a", filter_or_rule="LookupX", current_value="A", target_value="B", confirm=False)))

print()
print("--- audit ---")
print(remediation_audit(break_id="BRK-TEST", limit=5))
