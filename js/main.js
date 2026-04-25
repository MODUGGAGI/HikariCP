import { CODE_DATA } from "./code-data.js";
import { SCENARIOS } from "./scenario-data.js";
import { state, navigationHistory, scenarioState, getActiveScenario } from "./state.js";
import {
  searchEl,
  viewerEl,
  codeEl,
  historyBackEl,
  historyForwardEl,
  scenarioToggleEl,
  scenarioPanelEl,
  scenarioSelectEl,
  scenarioFirstEl,
  scenarioPrevEl,
  scenarioNextEl,
  scenarioHeadingEl,
  scenarioCaptionEl
} from "./dom.js";
import { getMethodOccurrences } from "./code-model.js";
import { render } from "./render.js";

function setActiveFile(fileName) {
  if (!CODE_DATA[fileName]) {
    return;
  }

  state.activeFile = fileName;
  render();
}

function getCurrentLocation() {
  return {
    file: state.activeFile,
    scrollTop: viewerEl.scrollTop
  };
}

function isSameLocation(left, right) {
  return left?.file === right?.file && left?.scrollTop === right?.scrollTop;
}

function updateHistoryButtons() {
  historyBackEl.disabled = navigationHistory.backStack.length === 0;
  historyForwardEl.disabled = navigationHistory.forwardStack.length === 0;
}

function restoreLocation(location) {
  if (!location || !CODE_DATA[location.file]) {
    return;
  }

  setActiveFile(location.file);
  requestAnimationFrame(() => {
    viewerEl.scrollTop = location.scrollTop ?? 0;
  });
}

function pushHistoryEntry(entry) {
  const lastEntry = navigationHistory.backStack[navigationHistory.backStack.length - 1];
  if (!isSameLocation(lastEntry, entry)) {
    navigationHistory.backStack.push(entry);
  }
  navigationHistory.forwardStack = [];
  updateHistoryButtons();
}

function navigateToFile(fileName, options = {}) {
  if (!CODE_DATA[fileName]) {
    return;
  }

  const {
    anchor,
    preserveScroll = false,
    pushHistory = false
  } = options;

  if (pushHistory) {
    pushHistoryEntry(getCurrentLocation());
  }

  setActiveFile(fileName);
  requestAnimationFrame(() => {
    if (!preserveScroll) {
      viewerEl.scrollTop = 0;
    }

    if (anchor) {
      const target = document.getElementById(anchor);
      if (!target) {
        return;
      }

      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("highlight");
      window.setTimeout(() => target.classList.remove("highlight"), 1500);
    }
  });
}

function jumpToAnchor(fileName, targetId) {
  navigateToFile(fileName, { anchor: targetId, pushHistory: true });
}

function goBack() {
  const previousLocation = navigationHistory.backStack.pop();
  if (!previousLocation) {
    return;
  }

  const currentLocation = getCurrentLocation();
  if (!isSameLocation(currentLocation, previousLocation)) {
    navigationHistory.forwardStack.push(currentLocation);
  }

  restoreLocation(previousLocation);
  updateHistoryButtons();
}

function goForward() {
  const nextLocation = navigationHistory.forwardStack.pop();
  if (!nextLocation) {
    return;
  }

  const currentLocation = getCurrentLocation();
  if (!isSameLocation(currentLocation, nextLocation)) {
    navigationHistory.backStack.push(currentLocation);
  }

  restoreLocation(nextLocation);
  updateHistoryButtons();
}

function flashScenarioTarget(target) {
  target.classList.add("highlight");
  window.setTimeout(() => target.classList.remove("highlight"), 1200);
}

function findScenarioTargetFromCurrentPosition() {
  const targets = [...codeEl.querySelectorAll(".code-line.scenario-active")];
  if (targets.length === 0) {
    return null;
  }

  return targets.find((target) => target.offsetTop > viewerEl.scrollTop + 4) || targets[0];
}

function focusScenarioStep(step) {
  requestAnimationFrame(() => {
    let target = step.anchor ? document.getElementById(step.anchor) : null;

    if (!target) {
      target = findScenarioTargetFromCurrentPosition();
    }

    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    flashScenarioTarget(target);
  });
}

function updateScenarioControls() {
  const scenario = getActiveScenario();
  const stepCount = scenario?.steps.length || 0;
  const currentStep = scenario?.steps[scenarioState.stepIndex] || null;
  const isScenarioOpen = scenarioState.isOpen;

  scenarioPanelEl.hidden = !isScenarioOpen;
  scenarioToggleEl.textContent = isScenarioOpen ? "Scenario On" : "Scenario Off";
  scenarioToggleEl.classList.toggle("is-on", isScenarioOpen);
  scenarioToggleEl.classList.toggle("is-off", !isScenarioOpen);

  scenarioPrevEl.disabled = stepCount === 0 || scenarioState.stepIndex === 0;
  scenarioNextEl.disabled = stepCount === 0 || scenarioState.stepIndex >= stepCount - 1;
  scenarioFirstEl.disabled = stepCount === 0 || scenarioState.stepIndex === 0;

  if (!scenario || !currentStep) {
    scenarioHeadingEl.textContent = "시나리오 없음";
    scenarioCaptionEl.textContent = "재생할 시나리오를 선택해 주세요.";
    return;
  }

  scenarioHeadingEl.textContent = `${scenario.title} · Step ${scenarioState.stepIndex + 1}/${stepCount}`;
  scenarioCaptionEl.textContent = currentStep.caption || scenario.description;
}

function setScenarioStep(stepIndex) {
  const scenario = getActiveScenario();
  if (!scenario || scenario.steps.length === 0) {
    return;
  }

  const boundedIndex = Math.min(Math.max(stepIndex, 0), scenario.steps.length - 1);
  scenarioState.stepIndex = boundedIndex;

  const step = scenario.steps[boundedIndex];
  updateScenarioControls();

  if (!scenarioState.isOpen) {
    render();
    return;
  }

  navigateToFile(step.file, {
    anchor: step.anchor,
    preserveScroll: true,
    pushHistory: false
  });
  focusScenarioStep(step);
}

function jumpToScenarioStep(stepIndex) {
  setScenarioStep(Number(stepIndex));
}

function goToFirstScenarioStep() {
  scenarioState.stepIndex = 0;
  setScenarioStep(0);
}

function stepScenario(direction) {
  setScenarioStep(scenarioState.stepIndex + direction);
}

function toggleScenarioMode() {
  scenarioState.isOpen = !scenarioState.isOpen;
  updateScenarioControls();
  render();

  if (scenarioState.isOpen) {
    setScenarioStep(scenarioState.stepIndex);
  }
}

function renderScenarioOptions() {
  scenarioSelectEl.innerHTML = SCENARIOS.map((scenario) => `
    <option value="${scenario.id}">${scenario.title}</option>
  `).join("");

  if (scenarioState.activeScenarioId) {
    scenarioSelectEl.value = scenarioState.activeScenarioId;
  }
}

function jumpToMethod(fileName, methodName, methodId) {
  const performJump = () => {
    const occurrences = getMethodOccurrences(fileName).filter((item) => item.name === methodName);
    if (occurrences.length === 0) {
      return;
    }

    const exactOccurrence = methodId
      ? occurrences.find((item) => item.anchor === methodId)
      : null;

    const nextOccurrence = exactOccurrence || occurrences.find((item) => {
      const target = document.getElementById(item.anchor);
      return target && target.offsetTop > viewerEl.scrollTop + 4;
    }) || occurrences[0];

    navigateToFile(fileName, { anchor: nextOccurrence.anchor, preserveScroll: true });
  };

  pushHistoryEntry(getCurrentLocation());

  if (state.activeFile !== fileName) {
    setActiveFile(fileName);
    requestAnimationFrame(performJump);
    return;
  }

  performJump();
}

document.body.addEventListener("click", (event) => {
  const actionTarget = event.target.closest("[data-action]");
  if (actionTarget) {
    const action = actionTarget.dataset.action;
    const fileName = actionTarget.dataset.file;

    if (action === "file") {
      navigateToFile(fileName, { pushHistory: true });
    }

    if (action === "method") {
      jumpToMethod(fileName, actionTarget.dataset.methodName, actionTarget.dataset.methodId);
    }

    if (action === "scenario-step") {
      jumpToScenarioStep(actionTarget.dataset.stepIndex);
    }

    return;
  }

  const navLink = event.target.closest(".class-link, .method-link");
  if (navLink) {
    if (navLink.dataset.anchor) {
      jumpToAnchor(navLink.dataset.file, navLink.dataset.anchor);
      return;
    }

    navigateToFile(navLink.dataset.file, { pushHistory: true });
  }
});

historyBackEl.addEventListener("click", goBack);
historyForwardEl.addEventListener("click", goForward);
scenarioToggleEl.addEventListener("click", toggleScenarioMode);
scenarioSelectEl.addEventListener("change", (event) => {
  scenarioState.activeScenarioId = event.target.value;
  scenarioState.stepIndex = 0;
  setScenarioStep(0);
});
scenarioFirstEl.addEventListener("click", goToFirstScenarioStep);
scenarioPrevEl.addEventListener("click", () => stepScenario(-1));
scenarioNextEl.addEventListener("click", () => stepScenario(1));

searchEl.addEventListener("input", (event) => {
  state.searchTerm = event.target.value;
  render();
});

renderScenarioOptions();
render();
updateHistoryButtons();
updateScenarioControls();
