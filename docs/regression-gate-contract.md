# AI Regression Gate Contract (v1.2.0)

This document defines the machine-readable schema used for automated release decisions in the AI QA Lab.

## Gate Contract Object
Located at the root of the regression report JSON.

| Field | Type | Description |
| :--- | :--- | :--- |
| `status` | `PASS` \| `WARN` \| `FAIL` | The overall release recommendation based on the current gate profile. |
| `blockingIssueCount` | `number` | Total number of critical or severe issues identifying by the gate engine. |
| `criticalRegressions` | `number` | Count of scenarios tagged as `critical` that passed in baseline but failed now. |
| `newRegressions` | `number` | Total count of scenarios that passed in baseline but failed in the current run. |
| `reportPath` | `string?` | Optional path to the full detailed report. |

## Usage in CI/CD
Automated pipelines should parse this object to determine if a build should be blocked.

### Failure Condition Example
- `status === "FAIL"`
- `criticalRegressions > 0`

---
*Maintained by AI Governance Layer*
