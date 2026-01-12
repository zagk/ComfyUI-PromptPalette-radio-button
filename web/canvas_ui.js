import {
  adjustWeightInLine,
  calculateNodeHeight,
  findTextWidget,
  removeLeadingCommentPrefix,
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
let colorCache = null;

export function setupCanvasUI(nodeType, config, app) {
  // Hook once per node type to avoid double-wrapping prototype methods.
  if (nodeType.prototype.__promptPaletteCanvasSetup) {
    return;
  }
  nodeType.prototype.__promptPaletteCanvasSetup = true;
  CONFIG = config;

  // Run the original handler to preserve other extensions.
  const origOnNodeCreated = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function () {
    if (origOnNodeCreated) {
      origOnNodeCreated.apply(this, arguments);
    }
    // Initialize Canvas UI only for new nodes in Nodes 1.0 mode.
    if (isVueNodesMode()) {
      return;
    }
    if (this.__promptPaletteUiMode) {
      return;
    }
    this.__promptPaletteUiMode = "canvas";
    this.isEditMode = false;
    const textWidget = findTextWidget(this);
    if (textWidget) {
      setWidgetVisibility(textWidget, false, { keepLayout: true });
      addEditButton(this, textWidget, app);
      setupClickHandler(this, textWidget, app);
    }
  };

  const origOnDrawForeground = nodeType.prototype.onDrawForeground;
  nodeType.prototype.onDrawForeground = function (ctx) {
    if (origOnDrawForeground) {
      origOnDrawForeground.call(this, ctx);
    }
    // Render the custom list UI in display mode.
    if (isVueNodesMode()) {
      return;
    }
    const textWidget = findTextWidget(this);
    if (textWidget && !this.isEditMode) {
      drawCheckboxList(this, ctx, textWidget.value, app);
    }
  };
}

// ========================================
// UI Control
// ========================================

function addEditButton(node, textWidget, app) {
  // Toggle between edit and display modes using the built-in widget button.
  const textButton = node.addWidget("button", "Edit", "edit_text", () => {
    node.isEditMode = !node.isEditMode;
    setWidgetVisibility(textWidget, node.isEditMode, { keepLayout: true });
    textButton.name = node.isEditMode ? "Save" : "Edit";
    app.graph.setDirtyCanvas(true);
  });

  const spacer = node.addWidget("text", "", "");
  spacer.computeSize = () => [0, 6];
  spacer.draw = () => {};
  spacer.serialize = false;
}

function setupClickHandler(node, textWidget, app) {
  // Route canvas clicks to the precomputed clickable areas.
  node.clickableAreas = [];

  node.findClickedArea = findClickedArea;
  node.handleClickableAreaAction = handleClickableAreaAction;

  node.onMouseDown = function (e, pos) {
    if (this.isEditMode) return;

    const clickedArea = this.findClickedArea(pos);
    if (clickedArea) {
      this.handleClickableAreaAction(clickedArea, textWidget, app);
    }
  };
}

function findClickedArea(pos) {
  const [x, y] = pos;
  for (const area of this.clickableAreas || []) {
    if (
      x >= area.x &&
      x <= area.x + area.w &&
      y >= area.y &&
      y <= area.y + area.h
    ) {
      return area;
    }
  }
  return null;
}

function handleClickableAreaAction(area, textWidget, app) {
  switch (area.action) {
    case "toggle": {
      const textLines = textWidget.value.split("\n");
      if (area.lineIndex >= 0 && area.lineIndex < textLines.length) {
        toggleCommentOnLine(textLines, area.lineIndex);
        textWidget.value = textLines.join("\n");
        app.graph.setDirtyCanvas(true);
      }
      break;
    }
    case "weight_plus":
      adjustWeightInText(textWidget, area.lineIndex, 0.1, app);
      break;
    case "weight_minus":
      adjustWeightInText(textWidget, area.lineIndex, -0.1, app);
      break;
  }
}

function adjustWeightInText(textWidget, lineIndex, delta, app) {
  const textLines = textWidget.value.split("\n");
  if (lineIndex >= 0 && lineIndex < textLines.length) {
    const line = textLines[lineIndex];
    textLines[lineIndex] = adjustWeightInLine(
      line,
      delta,
      CONFIG.minWeight,
      CONFIG.maxWeight,
    );
    textWidget.value = textLines.join("\n");
    app.graph.setDirtyCanvas(true);
  }
}

// ========================================
// Drawing
// ========================================

function drawCheckboxList(node, ctx, text, app) {
  // Draw the list and adjust node height to fit content.
  if (node.flags && node.flags.collapsed) {
    return;
  }

  const lines = text.split("\n");
  const textHeight = calculateNodeHeight(lines.length, CONFIG);

  if (node.size[1] < textHeight) {
    node.size[1] = textHeight;
    app.graph.setDirtyCanvas(true);
  }

  ctx.font = "14px monospace";
  ctx.textAlign = "left";
  if (text.trim() !== "") {
    drawCheckboxItems(ctx, lines, node);
  } else {
    ctx.fillStyle = getColors().inactiveTextColor;
    ctx.textAlign = "center";
    ctx.fillText("No Text", node.size[0] / 2, node.size[1] / 2);
  }
}

function drawCheckboxItems(ctx, lines, node) {
  if (node) {
    node.clickableAreas = [];
  }

  lines.forEach((line, index) => {
    if (isEmptyLine(line)) return;

    const y = CONFIG.topNodePadding + index * CONFIG.lineHeight;
    const isCommented = isLineCommented(line);

    drawCheckbox(ctx, y, isCommented, node, index);

    const phraseText = getPhraseText(line, isCommented);
    drawPhraseText(ctx, phraseText, y, isCommented, line);

    drawWeightControls(ctx, y, line, isCommented, node, index);
  });
}

function drawCheckbox(ctx, y, isCommented, node, lineIndex) {
  const checkboxX = CONFIG.sideNodePadding;
  const checkboxY = y;
  const checkboxW = CONFIG.checkboxSize;
  const checkboxH = CONFIG.checkboxSize;

  if (node) {
    node.clickableAreas.push({
      x: checkboxX,
      y: checkboxY,
      w: checkboxW,
      h: checkboxH,
      type: "checkbox",
      lineIndex: lineIndex,
      action: "toggle",
    });
  }

  if (isCommented) {
    ctx.strokeStyle = getColors().checkboxBorderColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(checkboxX, checkboxY, checkboxW, checkboxH, 4);
    ctx.stroke();
  } else {
    ctx.fillStyle = getColors().checkboxFillColor;
    ctx.beginPath();
    ctx.roundRect(checkboxX, checkboxY, checkboxW, checkboxH, 4);
    ctx.fill();

    ctx.strokeStyle = getColors().checkboxSymbolColor;
    ctx.lineWidth = 2;
    const centerX = checkboxX + checkboxW / 2;
    const centerY = checkboxY + checkboxH / 2;
    const checkSize = checkboxW * 0.4;
    ctx.beginPath();
    ctx.moveTo(centerX - checkSize * 0.7, centerY + checkSize * 0.0);
    ctx.lineTo(centerX - checkSize * 0.3, centerY + checkSize * 0.5);
    ctx.lineTo(centerX + checkSize * 0.7, centerY - checkSize * 0.5);
    ctx.stroke();
  }
}

function drawPhraseText(ctx, phraseText, y, isCommented, originalLine) {
  const colors = getColors();
  ctx.fillStyle = isCommented
    ? colors.inactiveTextColor
    : colors.defaultTextColor;
  ctx.textAlign = "left";

  const textToCheck = removeLeadingCommentPrefix(originalLine, isCommented);
  const weight = parseWeight(textToCheck);
  const isBold = weight !== 1.0;

  ctx.font = isBold
    ? `bold ${CONFIG.fontSize}px monospace`
    : `${CONFIG.fontSize}px monospace`;

  const checkboxCenter = y + CONFIG.checkboxSize / 2;
  const textBaseline = checkboxCenter + CONFIG.fontSize * 0.35;

  ctx.fillText(
    phraseText,
    CONFIG.sideNodePadding +
      CONFIG.checkboxSize +
      CONFIG.spaceBetweenCheckboxAndText,
    textBaseline,
  );
}

function drawWeightControls(ctx, y, line, isCommented, node, lineIndex) {
  // Draw +/- buttons and optional weight label.
  const nodeWidth = node.size[0];
  const textToCheck = removeLeadingCommentPrefix(line, isCommented);

  if (isCommented && !textToCheck.trim()) return;

  const weightText = getWeightText(textToCheck);
  const checkboxCenter = y + CONFIG.checkboxSize / 2;

  let currentX = nodeWidth - CONFIG.sideNodePadding;

  const plusButtonX = currentX - CONFIG.weightButtonSize;
  const plusButtonY = y;
  drawWeightButton(
    ctx,
    plusButtonX,
    plusButtonY,
    "+",
    node,
    lineIndex,
    "weight_plus",
  );
  currentX = plusButtonX - 4;

  const minusButtonX = currentX - CONFIG.weightButtonSize;
  const minusButtonY = y;
  drawWeightButton(
    ctx,
    minusButtonX,
    minusButtonY,
    "-",
    node,
    lineIndex,
    "weight_minus",
  );
  currentX = minusButtonX - 4;

  if (weightText) {
    const textColors = getColors();
    ctx.fillStyle = isCommented
      ? textColors.inactiveTextColor
      : textColors.defaultTextColor;
    ctx.textAlign = "right";
    ctx.font = "12px monospace";
    const textBaseline = checkboxCenter + CONFIG.fontSize * 0.35;
    ctx.fillText(weightText, currentX - 2, textBaseline);
    ctx.textAlign = "left";
  }
}

function drawWeightButton(ctx, x, y, symbol, node, lineIndex, action) {
  const buttonSize = CONFIG.weightButtonSize;

  if (node) {
    node.clickableAreas.push({
      x: x,
      y: y,
      w: buttonSize,
      h: buttonSize,
      type: "weight_button",
      lineIndex: lineIndex,
      action: action,
      node: node,
    });
  }

  ctx.fillStyle = getColors().weightButtonFillColor;
  ctx.beginPath();
  ctx.roundRect(x, y, buttonSize, buttonSize, 4);
  ctx.fill();

  ctx.strokeStyle = getColors().weightButtonSymbolColor;
  ctx.lineWidth = 2;
  const centerX = x + buttonSize / 2;
  const centerY = y + buttonSize / 2;
  const symbolSize = 6;

  ctx.beginPath();
  if (symbol === "+") {
    ctx.moveTo(centerX - symbolSize / 2, centerY);
    ctx.lineTo(centerX + symbolSize / 2, centerY);
    ctx.moveTo(centerX, centerY - symbolSize / 2);
    ctx.lineTo(centerX, centerY + symbolSize / 2);
  } else if (symbol === "-") {
    ctx.moveTo(centerX - symbolSize / 2, centerY);
    ctx.lineTo(centerX + symbolSize / 2, centerY);
  }
  ctx.stroke();
}

// ========================================
// Color
// ========================================

function getColors() {
  // Cache theme-derived colors for performance.
  if (colorCache) {
    return colorCache;
  }
  const themeColors = getComfyUIThemeColors();
  colorCache = {
    defaultTextColor: themeColors.inputText,
    inactiveTextColor: themeColors.inputText + "66",
    checkboxBorderColor: themeColors.inputText + "80",
    checkboxFillColor: themeColors.inputText + "BB",
    checkboxSymbolColor: themeColors.comfyInputBg,
    weightButtonFillColor: themeColors.comfyInputBg,
    weightButtonSymbolColor: themeColors.inputText + "99",
  };
  return colorCache;
}

function getComfyUIThemeColors() {
  const style = getComputedStyle(document.documentElement);
  return {
    fgColor:
      expandHexColor(style.getPropertyValue("--fg-color").trim()) || "#ffffff",
    bgColor:
      expandHexColor(style.getPropertyValue("--bg-color").trim()) || "#202020",
    comfyMenuBg:
      expandHexColor(style.getPropertyValue("--comfy-menu-bg").trim()) ||
      "#353535",
    comfyInputBg:
      expandHexColor(style.getPropertyValue("--comfy-input-bg").trim()) ||
      "#222222",
    inputText:
      expandHexColor(style.getPropertyValue("--input-text").trim()) ||
      "#dddddd",
    descripText:
      expandHexColor(style.getPropertyValue("--descrip-text").trim()) ||
      "#999999",
    errorText:
      expandHexColor(style.getPropertyValue("--error-text").trim()) ||
      "#ff4444",
    borderColor:
      expandHexColor(style.getPropertyValue("--border-color").trim()) ||
      "#4e4e4e",
  };
}

function expandHexColor(color) {
  if (!color || !color.startsWith("#")) return color;
  if (color.length === 4) {
    return (
      "#" + color[1] + color[1] + color[2] + color[2] + color[3] + color[3]
    );
  }
  return color;
}
