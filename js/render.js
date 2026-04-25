import { CODE_DATA, CLASS_ICON_PATH } from "./code-data.js";
import { state, scenarioState, getActiveScenario, getActiveScenarioStep } from "./state.js";
import {
  fileListEl,
  tabsEl,
  summaryEl,
  codeEl,
  footerPathEl,
  scenarioOutlineEl,
  scenarioOutlineTitleEl,
  scenarioStepListEl
} from "./dom.js";
import { getMethodOccurrences, highlightLine } from "./code-model.js";

function getScenarioLineIndices(fileName, step = getActiveScenarioStep()) {
  if (!step || step.file !== fileName) {
    return [];
  }

  if (step.lineMatch) {
    const matchedIndices = CODE_DATA[fileName].code
      .split("\n")
      .flatMap((line, lineIndex) => line.includes(step.lineMatch) ? [lineIndex] : []);

    if (step.lineMatchOccurrence) {
      const targetIndex = matchedIndices[step.lineMatchOccurrence - 1];
      return targetIndex === undefined ? [] : [targetIndex];
    }

    return matchedIndices;
  }

  const matches = []
    .concat(step.lineMatches || [])
    .filter(Boolean);

  return CODE_DATA[fileName].code
    .split("\n")
    .flatMap((line, lineIndex) => matches.some((match) => line.includes(match)) ? [lineIndex] : []);
}

export function renderSidebar() {
  const files = Object.keys(CODE_DATA).filter((name) =>
    name.toLowerCase().includes(state.searchTerm.toLowerCase())
  );

  fileListEl.innerHTML = files.map((fileName) => {
    const file = CODE_DATA[fileName];
    const isActive = fileName === state.activeFile;

    return `
      <div>
        <button class="file-button ${isActive ? "active" : ""}" data-action="file" data-file="${fileName}">
          <span>${isActive ? "▾" : "▸"}</span>
          <img class="class-icon" src="${CLASS_ICON_PATH}" alt="" />
          <span>${fileName}</span>
        </button>
        ${isActive ? `
          <div class="method-list">
            ${file.methods.map((method) => `
              <button class="method-button" data-action="method" data-file="${fileName}" data-method-name="${method.name}" data-method-id="${method.id}">
                ◦ ${method.label || `${method.name}()`}
              </button>
            `).join("")}
          </div>
        ` : ""}
      </div>
    `;
  }).join("");
}

export function renderTabs() {
  tabsEl.innerHTML = Object.keys(CODE_DATA).map((fileName) => `
    <button class="tab-button ${fileName === state.activeFile ? "active" : ""}" data-action="file" data-file="${fileName}">
      <img class="class-icon" src="${CLASS_ICON_PATH}" alt="" />
      <span>${fileName}</span>
    </button>
  `).join("");
}

export function renderCode() {
  const file = CODE_DATA[state.activeFile];
  const lines = file.code.split("\n");
  const methodOccurrences = getMethodOccurrences(state.activeFile);
  const methodOccurrenceByLine = new Map(methodOccurrences.map((item) => [item.lineIndex, item]));
  const scenarioLineIndices = new Set(getScenarioLineIndices(state.activeFile));
  const activeScenarioStep = getActiveScenarioStep();

  summaryEl.textContent = file.description;
  footerPathEl.textContent = `src/main/java/com/zaxxer/hikari/${state.activeFile}`;

  codeEl.innerHTML = lines.map((line, idx) => {
    const method = methodOccurrenceByLine.get(idx);
    const anchor = file.anchors?.find((item) => line.includes(item.match));
    const lineId = method?.anchor || anchor?.id || "";
    const isScenarioAnchor = activeScenarioStep?.file === state.activeFile && activeScenarioStep.anchor === lineId;
    const lineClass = [
      method ? "method" : "",
      scenarioLineIndices.has(idx) || isScenarioAnchor ? "scenario-active" : ""
    ].filter(Boolean).join(" ");

    return `
      <div class="code-line ${lineClass}" ${lineId ? `id="${lineId}"` : ""} data-line-index="${idx}">
        <span class="line-number">${idx + 1}</span>
        <span class="line-code">${highlightLine(line, state.activeFile, idx)}</span>
      </div>
    `;
  }).join("");
}

export function renderScenarioOutline() {
  const scenario = getActiveScenario();
  const isVisible = scenarioState.isOpen && Boolean(scenario);

  scenarioOutlineEl.hidden = !isVisible;

  if (!isVisible) {
    scenarioOutlineTitleEl.textContent = "";
    scenarioStepListEl.innerHTML = "";
    return;
  }

  scenarioOutlineTitleEl.textContent = scenario.title;
  scenarioStepListEl.innerHTML = scenario.steps.map((step, index) => {
    const statusClass = [
      "scenario-step-item",
      index === scenarioState.stepIndex ? "is-current" : "",
      index < scenarioState.stepIndex ? "is-completed" : ""
    ].filter(Boolean).join(" ");
    const label = step.label || step.caption || `Step ${index + 1}`;

    return `
      <button
        class="${statusClass}"
        type="button"
        data-action="scenario-step"
        data-step-index="${index}"
      >
        <span class="scenario-step-number">${index + 1}</span>
        <span class="scenario-step-label">${label}</span>
      </button>
    `;
  }).join("");
}

export function render() {
  renderSidebar();
  renderTabs();
  renderCode();
  renderScenarioOutline();
}
