export function findTextWidget(node) {
  if (!node || !node.widgets) return null;
  for (const w of node.widgets) {
    if (w.name === "text") {
      return w;
    }
  }
  return null;
}

export function findDelimiterWidget(node) {
  if (!node || !node.widgets) return null;
  for (const w of node.widgets) {
    if (w.name === "delimiter") {
      return w;
    }
  }
  return null;
}

export const VALID_DELIMITERS = [
  "comma & line break",
  "comma",
  "line break",
  "space",
];

export const DEFAULT_DELIMITER = VALID_DELIMITERS[0];

export function validateDelimiterValue(delimiterWidget) {
  if (!delimiterWidget) return;
  if (!VALID_DELIMITERS.includes(delimiterWidget.value)) {
    delimiterWidget.value = DEFAULT_DELIMITER;
  }
}

export function showWidget(widget) {
  applyWidgetVisibility(widget, true, false);
}

export function hideWidget(widget) {
  applyWidgetVisibility(widget, false, false);
}

export function hideWidgetAndKeepSpace(widget) {
  applyWidgetVisibility(widget, false, true);
}

function applyWidgetVisibility(widget, visible, keepSpace) {
  if (!widget) return;
  setWidgetHiddenFlag(widget, !visible, keepSpace);
  setWidgetDisabled(widget, !visible);
  setWidgetElementDisplay(widget, visible);
}

function setWidgetHiddenFlag(widget, hidden, keepSpace) {
  const hiddenValue = keepSpace ? false : hidden;
  widget.hidden = hiddenValue;
  if (widget.options) {
    widget.options.hidden = hiddenValue;
  }
}

function setWidgetDisabled(widget, disabled) {
  // Prevent hidden widgets from receiving input or focus.
  // Without this, canvas UI elements become unclickable when preserving layout.
  widget.disabled = disabled;
  widget.computedDisabled = disabled;
}

function setWidgetElementDisplay(widget, visible) {
  const el = widget.element || widget.inputEl;
  if (!el || !el.style) return;
  el.style.display = visible ? "" : "none";
  el.style.pointerEvents = visible ? "" : "none";
}

export function calculateNodeHeight(lineCount, config) {
  return Math.max(
    config.minNodeHeight,
    config.topNodePadding + lineCount * config.lineHeight + 10,
  );
}