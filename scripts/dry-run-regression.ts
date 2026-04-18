import { dryRunScenarios } from "@/lib/dry-run/scenario-catalog";
import { simulateConversation } from "@/lib/dry-run/simulate";

function deepEqualArray(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function compareScenario(actual: Awaited<ReturnType<typeof simulateConversation>>, expected: (typeof dryRunScenarios)[number]["expected"]) {
  const failures: string[] = [];

  if (actual.detected_intent !== expected.intent) {
    failures.push(`intent expected=${expected.intent} actual=${actual.detected_intent}`);
  }

  if (actual.should_handoff !== expected.should_handoff) {
    failures.push(`should_handoff expected=${expected.should_handoff} actual=${actual.should_handoff}`);
  }

  if (!deepEqualArray(actual.missing_fields, expected.missing_fields)) {
    failures.push(`missing_fields expected=${JSON.stringify(expected.missing_fields)} actual=${JSON.stringify(actual.missing_fields)}`);
  }

  if ((actual.handoff_reason ?? null) !== expected.handoff_reason) {
    failures.push(`handoff_reason expected=${expected.handoff_reason} actual=${actual.handoff_reason}`);
  }

  if (expected.extracted_fields) {
    for (const [key, value] of Object.entries(expected.extracted_fields)) {
      const actualValue = actual.extracted_fields[key as keyof typeof actual.extracted_fields];
      if (actualValue !== value) {
        failures.push(`extracted_fields.${key} expected=${value} actual=${actualValue}`);
      }
    }
  }

  if (expected.customer_reply_equals && actual.customer_reply !== expected.customer_reply_equals) {
    failures.push(`customer_reply expected exact=${expected.customer_reply_equals} actual=${actual.customer_reply}`);
  }

  if (expected.customer_reply_includes) {
    for (const item of expected.customer_reply_includes) {
      if (!actual.customer_reply.includes(item)) {
        failures.push(`customer_reply missing fragment=${item}`);
      }
    }
  }

  if (expected.admin_summary) {
    for (const [key, value] of Object.entries(expected.admin_summary)) {
      const actualValue = actual.admin_summary[key as keyof typeof actual.admin_summary];
      if (actualValue !== value) {
        failures.push(`admin_summary.${key} expected=${value} actual=${actualValue}`);
      }
    }
  }

  return failures;
}

async function main() {
  const rows: Array<{ name: string; ok: boolean; failures: string[] }> = [];

  for (const scenario of dryRunScenarios) {
    const actual = await simulateConversation(scenario.input);
    const failures = compareScenario(actual, scenario.expected);
    rows.push({
      name: scenario.name,
      ok: failures.length === 0,
      failures
    });
  }

  const failed = rows.filter((row) => !row.ok);

  for (const row of rows) {
    console.log(`${row.ok ? "PASS" : "FAIL"} ${row.name}`);
    for (const failure of row.failures) {
      console.log(`  - ${failure}`);
    }
  }

  console.log(`\nSummary: ${rows.length - failed.length}/${rows.length} passed`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

void main();
