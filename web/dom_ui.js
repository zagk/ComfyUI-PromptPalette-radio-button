import { findTextWidget, hideWidget, showWidget } from "./ui_utils.js";
import { Line } from "./line.js";

const CONFIG = {
  lineHeight: 26,
  fontSize: 14,
  checkboxSize: 18,
  spaceBetweenCheckboxAndText: 8,
  weightButtonSize: 18,
  weightLabelWidth: 30,
};

const DOM_WIDGET_NAME = "promptpalette_ui";

export function setupDomUI(nodeType, app) {
  // Hook once per node type to avoid double-wrapping prototype methods.
  if (nodeType.prototype.__nodeTypeInitialized) {
    return;
  }
  nodeType.prototype.__nodeTypeInitialized = true;

  // Run the original handler to preserve other extensions.
  const origOnNodeCreated = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function () {
    if (origOnNodeCreated) {
      origOnNodeCreated.apply(this, arguments);
    }
    if (this.__nodeInitialized) {
      return;
    }
    this.__nodeInitialized = true;
    const textWidget = findTextWidget(this);
    if (!textWidget) return;

    this.__promptPaletteDomUI = new PromptPaletteDomUI(this, textWidget, app);
  };
}

export function refreshDomUI(node) {
  if (!node || !node.__promptPaletteDomUI) return;
  node.__promptPaletteDomUI.refresh();
}

class PromptPaletteDomUI {
  static MODE = Object.freeze({
    EDIT: "edit",
    DISPLAY: "display",
  });
  static EVENT = Object.freeze({
    TOGGLE: "toggle",
    WEIGHT_PLUS: "weight_plus",
    WEIGHT_MINUS: "weight_minus",
  });

  #node;
  #textWidget;
  #app;
  #mode;
  #rootContainer;
  #rowsContainer;
  #emptyMessage;
  #toggleButton;
  #rootWidget;

  constructor(node, textWidget, app) {
    this.#node = node;
    this.#textWidget = textWidget;
    this.#app = app;
    this.#mode = PromptPaletteDomUI.MODE.DISPLAY;

    this.#rootContainer = this.#createRootContainer();
    this.#rowsContainer = this.#createRowsContainer();
    this.#emptyMessage = this.#createEmptyMessage();
    this.#toggleButton = this.#createToggleButton();
    const buttonContainer = this.#createButtonContainer();
    buttonContainer.append(this.#toggleButton);

    this.#rootContainer.append(
      this.#rowsContainer,
      this.#emptyMessage,
      buttonContainer,
    );
    this.#rootWidget = this.#registerRootWidget();
    this.#rowsContainer.addEventListener(
      PromptPaletteDomUI.EVENT.TOGGLE,
      (event) => this.#handleRowToggleEvent(event),
    );
    this.#rowsContainer.addEventListener(
      PromptPaletteDomUI.EVENT.WEIGHT_PLUS,
      (event) => this.#handleRowWeightPlusEvent(event),
    );
    this.#rowsContainer.addEventListener(
      PromptPaletteDomUI.EVENT.WEIGHT_MINUS,
      (event) => this.#handleRowWeightMinusEvent(event),
    );
    this.#attachCollapseHook();
    this.#updateRootWidgetVisibility();
    this.#applyMode();
  }

  refresh() {
    if (!this.#textWidget) {
      this.#textWidget = findTextWidget(this.#node);
      if (!this.#textWidget) return;
    }
    this.#updateRootWidgetVisibility();
    this.#applyMode();
  }

  // ========================================
  // DOM Element Creation
  // ========================================
  #createRootContainer() {
    const rootContainer = document.createElement("div");
    rootContainer.style.width = "100%";
    rootContainer.style.display = "flex";
    rootContainer.style.flexDirection = "column";
    rootContainer.style.gap = "2px";
    rootContainer.style.boxSizing = "border-box";
    rootContainer.style.height = "100%";
    rootContainer.style.fontSize = `${CONFIG.fontSize}px`;
    rootContainer.style.color = "var(--input-text)";
    return rootContainer;
  }

  #createRowsContainer() {
    const rowsContainer = document.createElement("div");
    rowsContainer.style.display = "flex";
    rowsContainer.style.flexDirection = "column";
    rowsContainer.style.gap = "4px";
    rowsContainer.style.flex = "1 1 auto";
    rowsContainer.style.minHeight = "0";
    return rowsContainer;
  }

  #createEmptyMessage() {
    const emptyMessage = document.createElement("div");
    emptyMessage.textContent = "No Text";
    emptyMessage.style.display = "none";
    emptyMessage.style.alignItems = "center";
    emptyMessage.style.justifyContent = "center";
    emptyMessage.style.flex = "1";
    emptyMessage.style.opacity = "0.6";
    return emptyMessage;
  }

  #createButtonContainer() {
    const buttonContainer = document.createElement("div");
    buttonContainer.style.marginTop = "auto";
    buttonContainer.style.paddingTop = "6px";

    return buttonContainer;
  }

  #createToggleButton() {
    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.style.width = "100%";
    toggleButton.style.border = "0";
    toggleButton.style.borderRadius = "6px";
    toggleButton.style.padding = "6px 8px";
    toggleButton.style.background = "var(--component-node-widget-background)";
    toggleButton.style.color = "var(--base-foreground)";
    toggleButton.style.fontSize = "12px";
    toggleButton.style.lineHeight = "1.2";
    toggleButton.style.cursor = "pointer";

    toggleButton.addEventListener("click", () => {
      this.#changeMode(
        this.#mode === PromptPaletteDomUI.MODE.EDIT
          ? PromptPaletteDomUI.MODE.DISPLAY
          : PromptPaletteDomUI.MODE.EDIT,
      );
    });
    toggleButton.addEventListener("mouseenter", () => {
      toggleButton.style.background =
        "var(--component-node-widget-background-hovered)";
    });
    toggleButton.addEventListener("mouseleave", () => {
      toggleButton.style.background = "var(--component-node-widget-background)";
    });

    return toggleButton;
  }

  #registerRootWidget() {
    const rootWidget = this.#node.addDOMWidget(
      DOM_WIDGET_NAME,
      "promptpalette",
      this.#rootContainer,
      {},
    );
    rootWidget.serialize = false;
    rootWidget.options.margin = 0;
    this.#updateToggleButtonLabel();
    return rootWidget;
  }

  // ========================================
  // Mode Management
  // ========================================
  #changeMode(mode) {
    this.#mode = mode;
    this.#applyMode();
    if (this.#mode !== PromptPaletteDomUI.MODE.DISPLAY) {
      this.#app.graph.setDirtyCanvas(true);
    }
  }

  #applyMode() {
    this.#updateTextWidgetVisibility();
    this.#refreshNodeWidgets();
    this.#callTextWidgetCallback();
    this.#updateToggleButtonLabel();
    if (this.#mode === PromptPaletteDomUI.MODE.DISPLAY) {
      this.#switchToDisplayModeUI();
    } else {
      this.#switchToEditModeUI();
    }
  }

  #updateToggleButtonLabel() {
    if (!this.#toggleButton) return;
    this.#toggleButton.textContent =
      this.#mode === PromptPaletteDomUI.MODE.EDIT ? "Save" : "Edit";
  }

  #updateTextWidgetVisibility() {
    if (!this.#textWidget) return;
    const visibility = this.#mode === PromptPaletteDomUI.MODE.EDIT;
    if (visibility) {
      showWidget(this.#textWidget);
    } else {
      hideWidget(this.#textWidget);
    }
  }

  #refreshNodeWidgets() {
    if (!this.#node?.widgets) return;
    this.#node.widgets = [...this.#node.widgets];
  }

  #callTextWidgetCallback() {
    if (!this.#textWidget || typeof this.#textWidget.callback !== "function") {
      return;
    }
    this.#textWidget.callback(this.#textWidget.value);
  }

  // ========================================
  // Collapse Handling
  // ========================================
  #attachCollapseHook() {
    const origCollapse = this.#node.collapse;
    this.#node.collapse = function () {
      const result = origCollapse
        ? origCollapse.apply(this, arguments)
        : undefined;
      this.__promptPaletteDomUI?.#updateRootWidgetVisibility();
      return result;
    };
  }

  #updateRootWidgetVisibility() {
    const isCollapsed = !!(this.#node.flags && this.#node.flags.collapsed);
    const shouldShow = !isCollapsed;
    this.#rootContainer.style.display = shouldShow ? "" : "none";
    if (this.#rootWidget) {
      this.#rootWidget.hidden = !shouldShow;
      if (this.#rootWidget.options) {
        this.#rootWidget.options.hidden = !shouldShow;
      }
    }
  }

  // ========================================
  // UI Mode Switching
  // ========================================
  #switchToDisplayModeUI() {
    const text = this.#textWidget.value || "";
    this.#rowsContainer.replaceChildren();
    if (!text.trim()) {
      // Empty text: show the empty-state message
      this.#rowsContainer.style.display = "none";
      this.#emptyMessage.style.display = "flex";
      return;
    }
    // Non-empty: show rows
    this.#rowsContainer.style.display = "flex";
    this.#emptyMessage.style.display = "none";
    // Build row elements
    text.split("\n").forEach((line, index) => {
      const row = new PromptPaletteRow(line, index);
      this.#rowsContainer.append(row.element);
    });
    this.#app.graph.setDirtyCanvas(true);
  }

  #switchToEditModeUI() {
    this.#rowsContainer.style.display = "none";
    this.#emptyMessage.style.display = "none";
  }

  // ========================================
  // Data Operations
  // ========================================
  #toggleLine(lineIndex) {
    if (this.#mode === PromptPaletteDomUI.MODE.EDIT) return;
    const textLines = this.#textWidget.value.split("\n");
    if (lineIndex < 0 || lineIndex >= textLines.length) return;

    const line = new Line(textLines[lineIndex]);
    line.toggleComment();
    textLines[lineIndex] = line.buildText();
    this.#textWidget.value = textLines.join("\n");
    this.#switchToDisplayModeUI();
  }

  #adjustLineWeight(lineIndex, delta) {
    if (this.#mode === PromptPaletteDomUI.MODE.EDIT) return;
    const textLines = this.#textWidget.value.split("\n");
    if (lineIndex < 0 || lineIndex >= textLines.length) return;

    const line = new Line(textLines[lineIndex]);
    line.adjustWeight(delta);
    textLines[lineIndex] = line.buildText();
    this.#textWidget.value = textLines.join("\n");
    this.#switchToDisplayModeUI();
  }

  // ========================================
  // Event Handling
  // ========================================
  #handleRowToggleEvent(event) {
    const lineIndex = event?.detail?.index;
    this.#toggleLine(lineIndex);
  }

  #handleRowWeightPlusEvent(event) {
    const lineIndex = event?.detail?.index;
    this.#adjustLineWeight(lineIndex, 0.1);
  }

  #handleRowWeightMinusEvent(event) {
    const lineIndex = event?.detail?.index;
    this.#adjustLineWeight(lineIndex, -0.1);
  }
}

class PromptPaletteRow {
  #line;
  #index;

  // ========================================
  // Constructor
  // ========================================
  constructor(lineText, index) {
    this.#line = new Line(lineText);
    this.#index = index;
    this.element = this.#createElement();
  }

  // ========================================
  // DOM Element Creation
  // ========================================
  #createElement() {
    if (this.#line.isPhraseTextEmpty()) {
      return this.#createEmptyRow();
    }
    const isCommented = this.#line.isCommented;
    const row = document.createElement("div");
    row.style.height = `${CONFIG.lineHeight}px`;
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = `${CONFIG.spaceBetweenCheckboxAndText}px`;
    if (isCommented) {
      row.style.opacity = "0.5";
    }

    // Build Checkbox + Display Text.
    row.append(this.#createCheckbox(isCommented));
    const displayTextElement = this.#createDisplayText();
    if (this.#line.weight !== 1.0) {
      displayTextElement.style.fontWeight = "bold";
    }
    row.append(displayTextElement);

    const weightButtonsContainer = this.#createWeightButtonsContainer();
    if (this.#line.weight !== 1.0) {
      weightButtonsContainer.append(
        this.#createWeightLabel(this.#line.weightText),
      );
    }
    weightButtonsContainer.append(
      this.#createWeightButton("-", () => this.#onWeightMinusClick()),
      this.#createWeightButton("+", () => this.#onWeightPlusClick()),
    );
    row.append(weightButtonsContainer);

    return row;
  }

  #createCheckbox(isCommented) {
    const checkbox = document.createElement("button");
    checkbox.type = "button";
    checkbox.style.width = `${CONFIG.checkboxSize}px`;
    checkbox.style.height = `${CONFIG.checkboxSize}px`;
    checkbox.style.borderRadius = "4px";
    checkbox.style.border = "1px solid var(--input-text)";
    checkbox.style.background = "transparent";
    checkbox.style.color = "var(--comfy-input-bg)";
    checkbox.style.lineHeight = "1";
    checkbox.style.padding = "0";
    checkbox.style.display = "inline-flex";
    checkbox.style.alignItems = "center";
    checkbox.style.justifyContent = "center";
    checkbox.style.cursor = "pointer";
    if (!isCommented) {
      checkbox.textContent = "\u2713";
      checkbox.style.background = "var(--input-text)";
    }
    checkbox.addEventListener("click", () => {
      this.#onToggleClick();
    });
    return checkbox;
  }

  #createDisplayText() {
    const displayTextElement = document.createElement("span");
    displayTextElement.textContent = this.#line.displayText;
    displayTextElement.style.flex = "1";
    displayTextElement.style.overflow = "hidden";
    displayTextElement.style.textOverflow = "ellipsis";
    displayTextElement.style.whiteSpace = "pre";
    return displayTextElement;
  }

  #createWeightButtonsContainer() {
    const weightButtonsContainer = document.createElement("div");
    weightButtonsContainer.style.display = "inline-flex";
    weightButtonsContainer.style.alignItems = "center";
    weightButtonsContainer.style.gap = "4px";
    weightButtonsContainer.style.marginLeft = "auto";
    return weightButtonsContainer;
  }

  #createWeightLabel(weightText) {
    const label = document.createElement("span");
    label.textContent = weightText;
    label.style.width = `${CONFIG.weightLabelWidth}px`;
    label.style.textAlign = "right";
    return label;
  }

  #createWeightButton(symbol, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = symbol;
    button.style.width = `${CONFIG.weightButtonSize}px`;
    button.style.height = `${CONFIG.weightButtonSize}px`;
    button.style.borderRadius = "4px";
    button.style.border = "0";
    button.style.background = "var(--component-node-widget-background)";
    button.style.color = "var(--base-foreground)";
    button.style.fontSize = "12px";
    button.style.lineHeight = "1";
    button.style.padding = "0";
    button.style.display = "inline-flex";
    button.style.alignItems = "center";
    button.style.justifyContent = "center";
    button.style.cursor = "pointer";
    button.addEventListener("click", onClick);
    button.addEventListener("mouseenter", () => {
      button.style.background =
        "var(--component-node-widget-background-hovered)";
    });
    button.addEventListener("mouseleave", () => {
      button.style.background = "var(--component-node-widget-background)";
    });
    return button;
  }

  #createEmptyRow() {
    const emptyRow = document.createElement("div");
    emptyRow.style.height = `${CONFIG.lineHeight}px`;
    emptyRow.style.display = "flex";
    emptyRow.style.alignItems = "center";
    emptyRow.style.gap = `${CONFIG.spaceBetweenCheckboxAndText}px`;
    emptyRow.style.pointerEvents = "none";
    return emptyRow;
  }

  // ========================================
  // Event Handling
  // ========================================
  #onToggleClick() {
    this.#dispatchEvent(PromptPaletteDomUI.EVENT.TOGGLE);
  }

  #onWeightPlusClick() {
    this.#dispatchEvent(PromptPaletteDomUI.EVENT.WEIGHT_PLUS);
  }

  #onWeightMinusClick() {
    this.#dispatchEvent(PromptPaletteDomUI.EVENT.WEIGHT_MINUS);
  }

  #dispatchEvent(type) {
    this.element.dispatchEvent(
      new CustomEvent(type, {
        bubbles: true,
        detail: { index: this.#index },
      }),
    );
  }
}
