# CI Pipeline Integration Guide

This guide explains how to integrate the AI QA Regression Gate into your CI/CD pipeline.

## 1. Automated Script
Run the regression suite via `npm`:
```bash
npm run test:regression -- balanced "CI Auto Run"
```

## 2. Gate Enforcement
The CLI script uses exit codes for enforcement:
- **Exit Code 0**: PASS/WARN (Ready to deploy)
- **Exit Code 1**: FAIL (Block deployment)

### GitHub Actions Example
```yaml
- name: Run AI Regression Gate
  run: npm run test:regression -- strict
  env:
    USER: github-actions
    NODE_ENV: ci

- name: Post PR Comment
  if: always()
  uses: machine-learning-apps/pr-comment@master
  with:
    path: regression-summary.md
```

## 3. Artifact Management
We recommend saving both the JSON report and Markdown summary as build artifacts.

| File | Purpose |
| :--- | :--- |
| `regression-report-cli.json` | Deep audit & automated parsing |
| `regression-summary.md` | Human review in PR comments |

## 4. Shared Baseline
To compare against a stable baseline in CI:
1. Store your `stable-baseline.json` in the repository.
2. Update the CLI script to accept a `--baseline` path (Roadmap).

---
*Maintained by AI Governance Layer*
