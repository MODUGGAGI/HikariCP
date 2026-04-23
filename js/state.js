import { SCENARIOS } from "./data.js";

export const state = {
  activeFile: "HikariDataSource.java",
  searchTerm: ""
};

export const navigationHistory = {
  backStack: [],
  forwardStack: []
};

export const scenarioState = {
  activeScenarioId: SCENARIOS[0]?.id ?? null,
  stepIndex: 0,
  isOpen: false
};

export function getScenarioById(scenarioId) {
  return SCENARIOS.find((scenario) => scenario.id === scenarioId) || null;
}

export function getActiveScenario() {
  return getScenarioById(scenarioState.activeScenarioId);
}

export function getActiveScenarioStep() {
  if (!scenarioState.isOpen) {
    return null;
  }

  const scenario = getActiveScenario();
  return scenario?.steps[scenarioState.stepIndex] || null;
}
