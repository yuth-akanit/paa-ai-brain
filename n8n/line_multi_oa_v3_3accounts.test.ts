import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function getWorkflow() {
  const workflowPath = path.join(process.cwd(), "n8n", "line_multi_oa_v3_3accounts.json");
  return JSON.parse(fs.readFileSync(workflowPath, "utf8"));
}

function getNode(workflow: any, name: string) {
  const node = (workflow.nodes || []).find((item: any) => item.name === name);
  assert.ok(node, `expected node "${name}" to exist`);
  return node;
}

function getAssignment(node: any, name: string) {
  const assignment = node.parameters?.assignments?.assignments?.find((item: any) => item.name === name);
  assert.ok(assignment, `expected assignment "${name}" to exist on node "${node.name}"`);
  return assignment;
}

function evaluateN8nExpression(expression: string, $json: Record<string, unknown>) {
  assert.match(expression, /^=\{\{[\s\S]*\}\}$/);
  const body = expression.slice(3, -2).trim();
  return Function("$json", `"use strict"; return (${body});`)($json);
}

test("workflow routes non-command traffic into Call paa-ai-brain", () => {
  const workflow = getWorkflow();
  const gate = getNode(workflow, "isCommand1");
  const callBrain = getNode(workflow, "Call paa-ai-brain");

  const gateJson = JSON.stringify(gate.parameters);
  assert.match(gateJson, /MENU/);
  assert.match(gateJson, /ADMIN/);
  assert.match(gateJson, /cmd/);

  const gateConnections = workflow.connections?.["isCommand1"]?.main?.[1] ?? [];
  assert.ok(
    gateConnections.some((edge: any) => edge.node === "Call paa-ai-brain"),
    "expected the non-command branch to flow into Call paa-ai-brain"
  );

  assert.equal(callBrain.type, "n8n-nodes-base.httpRequest");
});

test("workflow exports round 2 shadow review metadata fields", () => {
  const workflow = getWorkflow();
  const raw = JSON.stringify(workflow);

  assert.match(raw, /active_flow_after/);
  assert.match(raw, /rule_hit/);
  assert.match(raw, /intercept_source/);
  assert.match(raw, /canonical_topic/);
  assert.match(raw, /handoff_state/);
  assert.match(raw, /decision_meta_json/);
});

test("Normalize cmd1 converts standard cleaning pricing text into MENU:PRICE_CLEAN", () => {
  const workflow = getWorkflow();
  const normalizeNode = getNode(workflow, "Normalize cmd1");
  const cmdAssignment = getAssignment(normalizeNode, "cmd");

  assert.equal(
    evaluateN8nExpression(cmdAssignment.value, { text: "ล้างแอร์ สอบถามราคา", cmd: null }),
    "MENU:PRICE_CLEAN"
  );

  assert.equal(
    evaluateN8nExpression(cmdAssignment.value, { text: "ซ่อมแอร์ สอบถามราคา", cmd: null }),
    null
  );

  assert.equal(
    evaluateN8nExpression(cmdAssignment.value, { text: "ล้างแอร์ 4 ทิศทาง ราคาเท่าไหร่", cmd: null }),
    null
  );

  assert.equal(
    evaluateN8nExpression(cmdAssignment.value, { text: "", cmd: "ADMIN:TRACK" }),
    "ADMIN:TRACK"
  );
});
