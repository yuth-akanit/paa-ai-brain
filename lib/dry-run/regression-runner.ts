import { dryRunScenarios } from "./scenario-catalog";
import { simulateConversation, SimulateResult } from "./simulate";

export type RegressionTestResult = {
  scenarioName: string;
  tags: string[];
  isPassed: boolean;
  intentMatch: boolean;
  handoffMatch: boolean;
  extractionStatus: "match" | "partial" | "mismatch" | "none";
  actual: SimulateResult | null;
  error?: string;
  severity: "critical" | "high" | "normal";
  fieldMismatches: {
    high: boolean;
    normal: boolean;
  };
};

export type RegressionSummary = {
  metadata: {
    schemaVersion: string;
    generatedAt: string;
    generatedBy?: string;
    environment?: string;
    notes?: string;
    approvedBy?: string;
    reviewedBy?: string;
    acceptedWarnings?: string[];
    gateProfile: GateProfile;
    scenarioCount: number;
    catalogVersion: string;
    catalogFingerprint: string; // Hash of scenario names + expected outcomes
  };
  total: number;
  passed: number;
  failed: number;
  intentMismatches: number;
  handoffMismatches: number;
  tagStats: Record<string, { total: number; passed: number }>;
  results: RegressionTestResult[];
  gateStatus: "PASS" | "WARN" | "FAIL";
  gateReasons: string[];
  profile: GateProfile;
  comparison?: {
    newRegressions: string[];
    newResolved: string[];
    accuracyDelta: number;
    compatibility: "COMPATIBLE" | "WARNING" | "INCOMPATIBLE";
    compatibilityReason?: string;
  };
  gateContract: {
    status: "PASS" | "WARN" | "FAIL";
    blockingIssueCount: number;
    criticalRegressions: number;
    newRegressions: number;
    reportPath?: string;
  };
};

const CRITICAL_FIELDS = ["intent", "should_handoff"];
const HIGH_PRIORITY_FIELDS = ["area", "machine_count", "service_type"];

export type GateProfile = "strict" | "balanced" | "lenient";

const FIELD_PRIORITY: Record<string, "critical" | "high" | "normal"> = {
  intent: "critical",
  should_handoff: "critical",
  area: "high",
  machine_count: "high",
  service_type: "high",
  preferred_date: "normal",
  urgency: "normal"
};

const GATE_PROFILES: Record<GateProfile, any> = {
  strict: {
    critical_mismatch: "FAIL",
    high_mismatch: "FAIL",
    normal_mismatch: "WARN",
    partial_extraction: "WARN"
  },
  balanced: {
    critical_mismatch: "FAIL",
    high_mismatch: "WARN",
    normal_mismatch: "WARN",
    partial_extraction: "IGNORE"
  },
  lenient: {
    critical_mismatch: "FAIL",
    high_mismatch: "WARN",
    normal_mismatch: "IGNORE",
    partial_extraction: "IGNORE"
  }
};

export async function runFullRegression(
  profile: GateProfile = "balanced",
  baselineSummary?: RegressionSummary,
  provenance: { 
    user?: string; 
    env?: string; 
    notes?: string;
    approvedBy?: string;
    reviewedBy?: string;
    acceptedWarnings?: string[];
  } = {}
): Promise<RegressionSummary> {
  // Calculate Catalog Fingerprint (simple string hash)
  const fingerprintSource = dryRunScenarios.map(s => `${s.name}:${JSON.stringify(s.expected)}`).join("|");
  let fingerprint = 0;
  for (let i = 0; i < fingerprintSource.length; i++) {
    fingerprint = ((fingerprint << 5) - fingerprint) + fingerprintSource.charCodeAt(i);
    fingerprint |= 0;
  }
  const catalogFingerprint = `sha-${Math.abs(fingerprint).toString(16)}`;

  const results: RegressionTestResult[] = [];
  let passedCount = 0;
  let intentMismatches = 0;
  let handoffMismatches = 0;
  const tagStats: Record<string, { total: number; passed: number }> = {};

  const rules = GATE_PROFILES[profile];

  for (const scenario of dryRunScenarios) {
    try {
      const actual = await simulateConversation(scenario.input);
      
      const intentMatch = actual.detected_intent === scenario.expected.intent;
      const handoffMatch = actual.should_handoff === scenario.expected.should_handoff;
      
      // Extraction check
      const expectedFields = scenario.expected.extracted_fields || {};
      const actualFields = actual.extracted_fields || {};
      const fieldKeys = Object.keys(expectedFields);
      let matchCount = 0;
      let hasHighPriorityMismatch = false;
      let hasNormalPriorityMismatch = false;
      
      fieldKeys.forEach(key => {
        const isMatch = JSON.stringify(actualFields[key as keyof typeof actualFields]) === JSON.stringify(expectedFields[key as keyof typeof expectedFields]);
        if (isMatch) {
          matchCount++;
        } else {
          const priority = FIELD_PRIORITY[key] || "normal";
          if (priority === "critical" || priority === "high") hasHighPriorityMismatch = true;
          else hasNormalPriorityMismatch = true;
        }
      });
      
      const extractionStatus: RegressionTestResult["extractionStatus"] = 
        fieldKeys.length === 0 ? "none" :
        matchCount === fieldKeys.length ? "match" :
        matchCount > 0 ? "partial" : "mismatch";

      const isPassed = intentMatch && handoffMatch && (extractionStatus === "match" || extractionStatus === "none");

      if (isPassed) passedCount++;
      if (!intentMatch) intentMismatches++;
      if (!handoffMatch) handoffMismatches++;

      // Update tag stats
      (scenario.tags || ["untagged"]).forEach(tag => {
        if (!tagStats[tag]) tagStats[tag] = { total: 0, passed: 0 };
        tagStats[tag].total++;
        if (isPassed) tagStats[tag].passed++;
      });

      results.push({
        scenarioName: scenario.name,
        tags: scenario.tags || [],
        isPassed,
        intentMatch,
        handoffMatch,
        extractionStatus,
        actual,
        severity: (scenario as any).severity || "normal",
        fieldMismatches: {
          high: hasHighPriorityMismatch,
          normal: hasNormalPriorityMismatch
        }
      });
    } catch (e) {
      results.push({
        scenarioName: scenario.name,
        tags: scenario.tags || [],
        isPassed: false,
        intentMatch: false,
        handoffMatch: false,
        extractionStatus: "none",
        actual: null,
        error: String(e),
        severity: "normal",
        fieldMismatches: {
          high: true, // Errors count as high failure
          normal: true
        }
      });
    }
  }

  // Calculate Release Gate based on Profile
  let gateStatus: "PASS" | "WARN" | "FAIL" = "PASS";
  const gateReasons: string[] = [];

  for (const res of results) {
    // Critical Failures
    if (!res.intentMatch || !res.handoffMatch || (res.severity === "critical" && !res.isPassed)) {
      gateStatus = "FAIL";
      gateReasons.push(`Critical failure in ${res.scenarioName}`);
    }

    // Extraction Failures/Warnings
    const fm = (res as any).fieldMismatches;
    if (fm?.high) {
      if (rules.high_mismatch === "FAIL") gateStatus = "FAIL";
      else if (rules.high_mismatch === "WARN" && gateStatus !== "FAIL") gateStatus = "WARN";
      gateReasons.push(`High-priority field mismatch in ${res.scenarioName}`);
    } else if (fm?.normal) {
      if (rules.normal_mismatch === "FAIL") gateStatus = "FAIL";
      else if (rules.normal_mismatch === "WARN" && gateStatus !== "FAIL") gateStatus = "WARN";
      if (rules.normal_mismatch !== "IGNORE") gateReasons.push(`Normal-priority field mismatch in ${res.scenarioName}`);
    }

    if (res.extractionStatus === "partial" && !fm?.high && !fm?.normal) {
      if (rules.partial_extraction === "WARN" && gateStatus !== "FAIL") gateStatus = "WARN";
      if (rules.partial_extraction !== "IGNORE") gateReasons.push(`Partial extraction (low risk) in ${res.scenarioName}`);
    }
  }

  // Comparison Logic
  let comparison: RegressionSummary["comparison"] | undefined;
  if (baselineSummary) {
    const newRegressionsList = results
      .filter(r => !r.isPassed && baselineSummary.results.find(b => b.scenarioName === r.scenarioName)?.isPassed)
      .map(r => r.scenarioName);
    
    const newResolved = results
      .filter(r => r.isPassed && baselineSummary.results.find(b => b.scenarioName === r.scenarioName)?.isPassed === false)
      .map(r => r.scenarioName);

    const oldAccuracy = (baselineSummary.passed / baselineSummary.total) * 100;
    const currentAccuracy = (passedCount / dryRunScenarios.length) * 100;

    // Compatibility check
    let compatibility: "COMPATIBLE" | "WARNING" | "INCOMPATIBLE" = "COMPATIBLE";
    let compatibilityReason = "";

    if (baselineSummary.metadata.catalogFingerprint !== catalogFingerprint) {
      compatibility = "INCOMPATIBLE";
      compatibilityReason = "Scenario catalog has changed (Fingerprint mismatch)";
    } else if (baselineSummary.metadata.schemaVersion !== "1.2.0") {
      compatibility = "WARNING";
      compatibilityReason = "Baseline schema version is outdated";
    } else if (baselineSummary.profile !== profile) {
      compatibility = "WARNING";
      compatibilityReason = `Different gate profiles used (${baselineSummary.profile} vs ${profile})`;
    }

    comparison = {
      newRegressions: compatibility === "INCOMPATIBLE" ? [] : newRegressionsList,
      newResolved: compatibility === "INCOMPATIBLE" ? [] : newResolved,
      accuracyDelta: compatibility === "INCOMPATIBLE" ? 0 : Number((currentAccuracy - oldAccuracy).toFixed(2)),
      compatibility,
      compatibilityReason
    };
  }

  const criticalRegressionsCount = comparison?.newRegressions.filter(name => 
    results.find(r => r.scenarioName === name)?.severity === "critical"
  ).length || 0;

  const summary: RegressionSummary = {
    metadata: {
      schemaVersion: "1.2.0",
      generatedAt: new Date().toISOString(),
      generatedBy: provenance.user,
      environment: provenance.env,
      notes: provenance.notes,
      approvedBy: provenance.approvedBy,
      reviewedBy: provenance.reviewedBy,
      acceptedWarnings: provenance.acceptedWarnings,
      gateProfile: profile,
      scenarioCount: dryRunScenarios.length,
      catalogVersion: "2026-04-16",
      catalogFingerprint
    },
    total: dryRunScenarios.length,
    passed: passedCount,
    failed: dryRunScenarios.length - passedCount,
    intentMismatches,
    handoffMismatches,
    tagStats,
    results,
    gateStatus,
    gateReasons: Array.from(new Set(gateReasons)),
    profile,
    comparison,
    gateContract: {
      status: gateStatus,
      blockingIssueCount: gateReasons.length,
      criticalRegressions: criticalRegressionsCount,
      newRegressions: comparison?.newRegressions.length || 0
    }
  };

  return summary;
}
