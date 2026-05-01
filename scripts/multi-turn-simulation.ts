import { simulateConversation } from "@/lib/dry-run/simulate";
import type { SimulateInput, SimulateResult } from "@/lib/dry-run/simulate";
import type { ExtractedCaseFields, IntentName, ConversationMetadata } from "@/lib/types";
import * as fs from 'fs';
import * as path from 'path';

type TurnExpectation = {
    intent?: IntentName;
    nextAction?: string;
    policyBlockReason?: string | null;
    pendingProposal?: boolean;
    stateAdvanced?: boolean;
    customer_reply_includes?: string[];
    extracted_fields?: Partial<ExtractedCaseFields>;
};

type MultiTurnScenario = {
    name: string;
    turns: Array<{
        user: string;
        expect: TurnExpectation;
    }>;
};

function compareTurn(actual: SimulateResult, expected: TurnExpectation): string[] {
    const failures: string[] = [];
    if (expected.intent && actual.detected_intent !== expected.intent) {
        failures.push(`intent expected=${expected.intent} actual=${actual.detected_intent}`);
    }
    if (expected.nextAction && actual.nextAction !== expected.nextAction) {
        failures.push(`nextAction expected=${expected.nextAction} actual=${actual.nextAction}`);
    }
    if (expected.policyBlockReason !== undefined && actual.policyBlockReason !== expected.policyBlockReason) {
        failures.push(`policyBlockReason expected=${expected.policyBlockReason} actual=${actual.policyBlockReason}`);
    }
    if (expected.pendingProposal !== undefined && actual.pendingProposal !== expected.pendingProposal) {
        failures.push(`pendingProposal expected=${expected.pendingProposal} actual=${actual.pendingProposal}`);
    }
    if (expected.stateAdvanced !== undefined && actual.stateAdvanced !== expected.stateAdvanced) {
        failures.push(`stateAdvanced expected=${expected.stateAdvanced} actual=${actual.stateAdvanced}`);
    }
    if (expected.customer_reply_includes) {
        for (const item of expected.customer_reply_includes) {
            if (!actual.customer_reply.includes(item)) {
                failures.push(`reply missing fragment="${item}" (Actual: ${actual.customer_reply})`);
            }
        }
    }
    if (expected.extracted_fields) {
        for (const [key, val] of Object.entries(expected.extracted_fields)) {
            const actualVal = (actual.extracted_fields as any)[key];
            if (String(actualVal) !== String(val)) {
                failures.push(`field ${key} expected=${val} actual=${actualVal}`);
            }
        }
    }
    return failures;
}

async function runScenario(scenario: MultiTurnScenario) {
    console.log(`\n▶ Running Multi-Turn: ${scenario.name}`);
    let priorState: any = {
        extracted_fields: {},
        metadata: {
            last_interaction_at: new Date().toISOString(),
            availability_flow_state: "none"
        }
    };

    let allPassed = true;

    for (let i = 0; i < scenario.turns.length; i++) {
        const turn = scenario.turns[i];
        console.log(`  Turn ${i + 1}: USER="${turn.user}"`);
        
        const result = await simulateConversation({
            message: turn.user,
            prior_case_state: priorState
        });

        const failures = compareTurn(result, turn.expect);
        if (failures.length > 0) {
            console.log(`    ❌ FAILED:`);
            failures.forEach(f => console.log(`      - ${f}`));
            allPassed = false;
        } else {
            console.log(`    ✅ OK (Intent: ${result.detected_intent}, Action: ${result.nextAction})`);
        }

        // Advance state
        priorState = {
            extracted_fields: result.extracted_fields,
            ai_intent: result.detected_intent,
            metadata: result.metadata
        };
    }

    return allPassed;
}

const scenarioPaths = [
    "fixtures/scenarios/m1b-sunday-negotiation.json",
    "fixtures/scenarios/m1b-advance-negotiation.json",
    "fixtures/scenarios/m1b-correction-negotiation.json"
];

async function main() {
    let totals = { passed: 0, failed: 0 };
    for (const p of scenarioPaths) {
        const fullPath = path.join(process.cwd(), p);
        if (!fs.existsSync(fullPath)) {
            console.warn(`File not found: ${p}`);
            continue;
        }
        const scenario = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as MultiTurnScenario;
        const ok = await runScenario(scenario);
        if (ok) totals.passed++; else totals.failed++;
    }

    console.log(`\nOVERALL: ${totals.passed} passed, ${totals.failed} failed`);
    if (totals.failed > 0) process.exit(1);
}

main();
