export function isMockMode() {
  return process.env.APP_MOCK_MODE === "true";
}

export function isDryRunMode() {
  return process.env.APP_DRY_RUN_MODE === "true";
}
