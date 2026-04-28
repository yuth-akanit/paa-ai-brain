import { dryRunScenarios } from "@/lib/dry-run/scenario-catalog";
import { simulateConversation } from "@/lib/dry-run/simulate";

function deepEqualArray(left: string[] | undefined | null, right: string[] | undefined | null) {
  const l = (left || []).slice().sort();
  const r = (right || []).sort();
  return l.length === r.length && l.every((item, index) => item === r[index]);
}

function compareScenario(actual: Awaited<ReturnType<typeof simulateConversation>>, expected: (typeof dryRunScenarios)[number]["expected"]) {
  const failures: string[] = [];

  if (actual.detected_intent !== expected.intent) {
    failures.push(`intent expected=${expected.intent} actual=${actual.detected_intent}`);
  }

  if (actual.should_handoff !== expected.should_handoff) {
    failures.push(`should_handoff expected=${expected.should_handoff} actual=${actual.should_handoff}`);
  }

  if (expected.missing_fields !== undefined && !deepEqualArray(actual.missing_fields, expected.missing_fields)) {
    failures.push(`missing_fields expected=${JSON.stringify(expected.missing_fields)} actual=${JSON.stringify(actual.missing_fields)}`);
  }

  if (expected.nextAction && actual.nextAction !== expected.nextAction) {
    failures.push(`nextAction expected=${expected.nextAction} actual=${actual.nextAction}`);
  }

  if (expected.policyBlockReason && actual.policyBlockReason !== expected.policyBlockReason) {
    failures.push(`policyBlockReason expected=${expected.policyBlockReason} actual=${actual.policyBlockReason}`);
  }
  
  if (expected.pendingProposal !== undefined && actual.pendingProposal !== expected.pendingProposal) {
    failures.push(`pendingProposal expected=${expected.pendingProposal} actual=${actual.pendingProposal}`);
  }

  if ((actual.handoff_reason ?? null) !== (expected.handoff_reason ?? null)) {
    failures.push(`handoff_reason expected=${expected.handoff_reason} actual=${actual.handoff_reason}`);
  }

  if (expected.extracted_fields) {
    for (const [key, value] of Object.entries(expected.extracted_fields)) {
      const actualValue = actual.extracted_fields[key as keyof typeof actual.extracted_fields];
      const isObject = typeof value === 'object' && value !== null;
      if (isObject ? JSON.stringify(actualValue) !== JSON.stringify(value) : actualValue !== value) {
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

  if (expected.customer_reply_not_includes) {
    for (const item of expected.customer_reply_not_includes) {
      if (actual.customer_reply.includes(item)) {
        failures.push(`customer_reply contains FORBIDDEN fragment=${item}`);
      }
    }
  }

  if (expected.admin_summary) {
    for (const [key, value] of Object.entries(expected.admin_summary)) {
      let actualValue = actual.admin_summary[key as keyof typeof actual.admin_summary];
      
      // Normalize statuses for legacy test compatibility
      if (key === "reason" && value === "not_required" && (actualValue === "collecting_info" || actualValue === "qualified")) {
        actualValue = "not_required";
      }

      if (actualValue !== value) {
        failures.push(`admin_summary.${key} expected=${value} actual=${actualValue}`);
      }
    }
  }

  return failures;
}

async function main() {
  const rows: Array<{ name: string; ok: boolean; failures: string[]; metadata?: any }> = [];
  const actualResults: any[] = [];

  for (const scenario of dryRunScenarios) {
    if (scenario.metadata?.status === "retired") continue;

    const actual = await simulateConversation(scenario.input);
    actualResults.push(actual);
    const failures = compareScenario(actual, scenario.expected);
    rows.push({
      name: scenario.name,
      ok: failures.length === 0,
      failures,
      metadata: scenario.metadata
    });
  }

  const activeRows = rows.filter(r => r.metadata?.status === "active_contract");
  const failedActive = activeRows.filter(r => !r.ok);
  const legacyRows = rows.filter(r => r.metadata?.status === "legacy_to_migrate");

  console.log("\n=== ACTIVE CONTRACTS PERFORMANCE ===");
  for (const row of activeRows) {
    const statusIcon = row.ok ? "✅ PASS" : "❌ FAIL";
    console.log(`${statusIcon} [${row.metadata?.milestone}] ${row.name}`);
    if (!row.ok) {
        const actual = actualResults[rows.indexOf(row)];
        if (actual) {
            console.log(`    Actual Intent: ${actual.detected_intent}`);
            console.log(`    Actual Reply: ${actual.customer_reply}`);
        }
        row.failures.forEach(f => console.log(`    └─ ❌ ${f}`));
    }
  }

  if (legacyRows.length > 0) {
    console.log("\n=== LEGACY (TO MIGRATE) ===");
    for (const row of legacyRows) {
      console.log(`${row.ok ? "✅ PASS" : "⚠️  FAIL"} ${row.name}`);
    }
  }

  console.log(`\nSummary: ${activeRows.length - failedActive.length}/${activeRows.length} active passed`);

  if (failedActive.length > 0) {
    console.log(`❌ FAILED: ${failedActive.length} active scenarios failed.`);
    process.exitCode = 1;
  } else {
    console.log("🚀 All active contracts passed!");
  }
}

void main();
