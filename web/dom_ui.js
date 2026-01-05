import {
  adjustWeightInLine,
  calculateNodeHeight,
  findTextWidget,
  getLineTextForWeight,
  getPhraseText,
  getWeightText,
  isEmptyLine,
  isLineCommented,
  isVueNodesMode,
  parseWeight,
  setWidgetVisibility,
  toggleCommentOnLine,
} from "./shared.js";

let CONFIG = null;

const DOM_WIDGET_NAME = "promptpalette_ui";
const STYLE_ID = "promptpalette-nodes2-style";

export function setupDomUI(nodeType, config, app) {
  if (nodeType.prototype.__promptPaletteDomSetup) {
    return;
  }
  nodeType.prototype.__promptPaletteDomSetup = true;
  CONFIG = config;

  const origOnNodeCreated = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function () {
    if (origOnNodeCreated) {
      origOnNodeCreated.apply(this, arguments);
    }
    if (!isVueNodesMode()) {
      return;
    }
    if (this.__promptPaletteUiMode) {
      return;
    }
    this.__promptPaletteUiMode = "dom";
    this.isEditMode = false;
    const textWidget = findTextWidget(this);
    if (!textWidget) return;

    ensureStyles();
    const domState = createDomState(this, textWidget, app);
    this.__promptPaletteDomState = domState;

    updateTextWidgetVisibility(this, textWidget, false);
    setupDomInteractions(this, textWidget, domState, app);
    wrapCollapseHandler(this, domState, app);
    updateDomVisibility(this, domState, app);
    updateDomList(this, textWidget, domState, app);
  };
}

export function refreshDomUI(node, app) {
  if (!node || !node.__promptPaletteDomState) return;
  if (!isVueNodesMode()) return;
  const textWidget = findTextWidget(node);
  if (!textWidget) return;
  const domState = node.__promptPaletteDomState;
  updateTextWidgetVisibility(node, textWidget, !!node.isEditMode);
  updateDomVisibility(node, domState, app);
  if (!node.isEditMode) {
    updateDomList(node, textWidget, domState, app);
  } else {
    setEditLayout(domState);
    updateEditButtonLabel(node, domState);
    syncNodeSize(node);
    app.graph.setDirtyCanvas(true);
  }
}

// ========================================
// UI Control
// ========================================

function setEditMode(node, textWidget, domState, app, isEditMode) {
  node.isEditMode = isEditMode;
  updateTextWidgetVisibility(node, textWidget, node.isEditMode);
  updateDomVisibility(node, domState, app);
  if (node.isEditMode) {
    setEditLayout(domState);
  } else {
    updateDomList(node, textWidget, domState, app);
  }
  updateEditButtonLabel(node, domState);
  syncNodeSize(node);
  app.graph.setDirtyCanvas(true);
}

function updateEditButtonLabel(node, domState) {
  if (!domState.toggleButton) return;
  domState.toggleButton.textContent = node.isEditMode ? "Save" : "Edit";
}

function updateTextWidgetVisibility(node, textWidget, visible) {
  if (!textWidget) return;
  setWidgetVisibility(textWidget, visible);
  if (textWidget.options) {
    textWidget.options.hidden = !visible;
    textWidget.options.canvasOnly = !visible;
  }
  textWidget.hidden = !visible;
  textWidget.disabled = !visible;
  textWidget.computedDisabled = !visible;
  if (node?.widgets) {
    node.widgets = [...node.widgets];
  }
  if (typeof textWidget.callback === "function") {
    textWidget.callback(textWidget.value);
  }
}

function setupDomInteractions(node, textWidget, domState, app) {
  domState.container.addEventListener("click", (event) => {
    if (node.isEditMode) return;
    const target =
      event.target instanceof Element
        ? event.target.closest("[data-pp-action]")
        : null;
    if (!target) return;
    const action = target.dataset.ppAction;
    const lineIndex = Number.parseInt(target.dataset.lineIndex || "", 10);
    if (!action || Number.isNaN(lineIndex)) return;

    const textLines = textWidget.value.split("\n");
    if (lineIndex < 0 || lineIndex >= textLines.length) return;

    switch (action) {
      case "toggle":
        toggleCommentOnLine(textLines, lineIndex);
        break;
      case "weight_plus":
        textLines[lineIndex] = adjustWeightInLine(
          textLines[lineIndex],
          0.1,
          CONFIG.minWeight,
          CONFIG.maxWeight,
        );
        break;
      case "weight_minus":
        textLines[lineIndex] = adjustWeightInLine(
          textLines[lineIndex],
          -0.1,
          CONFIG.minWeight,
          CONFIG.maxWeight,
        );
        break;
      default:
        return;
    }

    textWidget.value = textLines.join("\n");
    updateDomList(node, textWidget, domState, app);
    app.graph.setDirtyCanvas(true);
  });
}

function wrapCollapseHandler(node, domState, app) {
  const origCollapse = node.collapse;
  node.collapse = function () {
    const result = origCollapse
      ? origCollapse.apply(this, arguments)
      : undefined;
    updateDomVisibility(this, domState, app);
    return result;
  };
}

function updateDomVisibility(node, domState, app) {
  const isCollapsed = !!(node.flags && node.flags.collapsed);
  const shouldShow = !isCollapsed;
  domState.container.style.display = shouldShow ? "" : "none";
  if (domState.widget) {
    domState.widget.hidden = !shouldShow;
    if (domState.widget.options) {
      domState.widget.options.hidden = !shouldShow;
    }
  }
  app.graph.setDirtyCanvas(true);
}

// ========================================
// DOM Rendering
// ========================================

function createDomState(node, textWidget, app) {
  const container = document.createElement("div");
  container.className = "pp-root";
  container.style.width = "100%";

  const list = document.createElement("div");
  list.className = "pp-list";
  const empty = document.createElement("div");
  empty.className = "pp-empty";
  empty.textContent = "No Text";

  const footer = document.createElement("div");
  footer.className = "pp-footer";
  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "pp-toggle-button";

  const domState = {
    container,
    list,
    empty,
    footer,
    toggleButton,
    layoutHeight: CONFIG.minNodeHeight,
    widget: null,
  };

  toggleButton.addEventListener("click", () => {
    setEditMode(node, textWidget, domState, app, !node.isEditMode);
  });

  footer.append(toggleButton);
  container.append(list, empty, footer);

  const widget = node.addDOMWidget(
    DOM_WIDGET_NAME,
    "promptpalette",
    container,
    {
      getMinHeight: () => domState.layoutHeight,
      getMaxHeight: () => domState.layoutHeight,
    },
  );
  widget.serialize = false;
  widget.options.margin = 0;
  domState.widget = widget;
  updateEditButtonLabel(node, domState);

  return domState;
}

function updateDomList(node, textWidget, domState, app) {
  const text = textWidget.value || "";
  const lines = text.split("\n");
  const fallbackHeight =
    calculateNodeHeight(lines.length, CONFIG) + CONFIG.domFooterHeight;

  domState.list.replaceChildren();

  if (text.trim() === "") {
    domState.list.style.display = "none";
    domState.empty.style.display = "flex";
    updateDomLayoutHeight(node, domState, fallbackHeight);
    syncNodeSize(node);
    app.graph.setDirtyCanvas(true);
    return;
  }

  domState.list.style.display = "flex";
  domState.empty.style.display = "none";

  lines.forEach((line, index) => {
    if (isEmptyLine(line)) return;

    const isCommented = isLineCommented(line);
    const row = document.createElement("div");
    row.className = "pp-row";
    row.style.height = `${CONFIG.lineHeight}px`;
    if (isCommented) {
      row.classList.add("pp-row--inactive");
    }

    const weightTarget = getLineTextForWeight(line, isCommented);
    const weightValue = parseWeight(weightTarget);
    if (weightValue !== 1.0) {
      row.classList.add("pp-row--weighted");
    }

    const checkbox = document.createElement("button");
    checkbox.type = "button";
    checkbox.className = "pp-checkbox";
    checkbox.dataset.ppAction = "toggle";
    checkbox.dataset.lineIndex = String(index);
    if (!isCommented) {
      checkbox.classList.add("pp-checkbox--checked");
      checkbox.textContent = "\u2713";
    }
    row.append(checkbox);

    const phraseText = document.createElement("span");
    phraseText.className = "pp-text";
    phraseText.textContent = getPhraseText(line, isCommented);
    row.append(phraseText);

    if (!(isCommented && !weightTarget.trim())) {
      const weightWrap = document.createElement("div");
      weightWrap.className = "pp-weight";

      const weightText = getWeightText(weightTarget);
      if (weightText) {
        const label = document.createElement("span");
        label.className = "pp-weight-label";
        label.textContent = weightText;
        weightWrap.append(label);
      }

      const minusButton = document.createElement("button");
      minusButton.type = "button";
      minusButton.className = "pp-weight-button";
      minusButton.dataset.ppAction = "weight_minus";
      minusButton.dataset.lineIndex = String(index);
      minusButton.textContent = "-";

      const plusButton = document.createElement("button");
      plusButton.type = "button";
      plusButton.className = "pp-weight-button";
      plusButton.dataset.ppAction = "weight_plus";
      plusButton.dataset.lineIndex = String(index);
      plusButton.textContent = "+";

      weightWrap.append(minusButton, plusButton);
      row.append(weightWrap);
    }

    domState.list.append(row);
  });

  updateDomLayoutHeight(node, domState, fallbackHeight);
  syncNodeSize(node);
  app.graph.setDirtyCanvas(true);
}

function setEditLayout(domState) {
  domState.list.style.display = "none";
  domState.empty.style.display = "none";
  domState.layoutHeight = CONFIG.domFooterHeight;
}

function syncNodeSize(node) {
  if (!node || typeof node.computeSize !== "function") return;
  const computedSize = node.computeSize();
  if (!computedSize || computedSize.length < 2) return;
  if (typeof node.setSize === "function") {
    node.setSize([node.size[0], computedSize[1]]);
  } else {
    node.size[1] = computedSize[1];
  }
}

function updateDomLayoutHeight(node, domState, fallbackHeight) {
  const measuredHeight = getDomContentHeight(domState);
  const nextHeight = Math.ceil(measuredHeight || fallbackHeight);
  domState.layoutHeight = nextHeight;
  applyDomNodeHeight(node, nextHeight);
}

function getDomContentHeight(domState) {
  if (!domState?.container) return 0;
  if (!domState.container.isConnected) return 0;
  const rect = domState.container.getBoundingClientRect();
  if (rect && rect.height) return rect.height;
  return domState.container.scrollHeight || 0;
}

function applyDomNodeHeight(node, height) {
  if (!isVueNodesMode()) return;
  if (!node || typeof document === "undefined") return;
  if (node.flags && node.flags.collapsed) return;
  if (!Number.isFinite(height)) return;

  const nodeId = node.id != null ? String(node.id) : "";
  if (!nodeId) return;
  const selectorId =
    typeof CSS !== "undefined" && CSS.escape ? CSS.escape(nodeId) : nodeId;
  const nodeEl = document.querySelector(`[data-node-id="${selectorId}"]`);
  if (!nodeEl) return;

  const nextHeight = Math.ceil(height);
  nodeEl.style.setProperty("--node-height", `${nextHeight}px`);
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.pp-root {
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-sizing: border-box;
  height: 100%;
  font-size: ${CONFIG.fontSize}px;
  color: var(--input-text);
}
.pp-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
  min-height: 0;
}
.pp-row {
  display: flex;
  align-items: center;
  gap: ${CONFIG.spaceBetweenCheckboxAndText}px;
}
.pp-row--inactive {
  opacity: 0.5;
}
.pp-row--weighted .pp-text {
  font-weight: bold;
}
.pp-checkbox {
  width: ${CONFIG.checkboxSize}px;
  height: ${CONFIG.checkboxSize}px;
  border-radius: 4px;
  border: 1px solid var(--input-text);
  background: transparent;
  color: var(--comfy-input-bg);
  line-height: 1;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.pp-checkbox--checked {
  background: var(--input-text);
  color: var(--comfy-input-bg);
}
.pp-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: pre;
}
.pp-weight {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
.pp-weight-label {
  width: ${CONFIG.weightLabelWidth}px;
  text-align: right;
}
.pp-weight-button {
  width: ${CONFIG.weightButtonSize}px;
  height: ${CONFIG.weightButtonSize}px;
  border-radius: 4px;
  border: 0;
  background: var(--component-node-widget-background);
  color: var(--base-foreground);
  font-size: 12px;
  line-height: 1;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.pp-weight-button:hover {
  background: var(--component-node-widget-background-hovered);
}
.pp-footer {
  margin-top: auto;
  padding-top: 6px;
}
.pp-toggle-button {
  width: 100%;
  border: 0;
  border-radius: 6px;
  padding: 6px 8px;
  background: var(--component-node-widget-background);
  color: var(--base-foreground);
  font-size: 12px;
  line-height: 1.2;
  cursor: pointer;
}
.pp-toggle-button:hover {
  background: var(--component-node-widget-background-hovered);
}
.pp-empty {
  display: none;
  align-items: center;
  justify-content: center;
  flex: 1;
  opacity: 0.6;
}
`;
  document.head.append(style);
}
