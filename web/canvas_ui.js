import { Line } from "./line.js";
import {
  calculateNodeHeight,
  findTextWidget,
  hideWidgetAndKeepSpace,
  showWidget,
} from "./ui_utils.js";

const CONFIG = {
  minNodeHeight: 80,
  topNodePadding: 40,
  sideNodePadding: 14,
  lineHeight: 24,
  fontSize: 13,
  checkboxSize: 16,
  checkboxAndTextGap: 6,
  weightLabelWidth: 34,
  weightLabelAndButtonGap: 2,
  weightButtonSize: 16,
  weightButtonGap: 4,
};

let colorCache = null;

export function setupCanvasUI(nodeType, app) {
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
    // Initialize Canvas UI for new nodes (caller ensures Nodes 1.0 mode).
    if (this.__nodeInitialized) {
      return;
    }
    this.__nodeInitialized = true;

    const textWidget = findTextWidget(this);
    if (textWidget) {
      this.__promptPaletteCanvasUI = new PromptPaletteCanvasUI(
        this,
        textWidget,
        app,
      );
    }
  };

  const origOnDrawForeground = nodeType.prototype.onDrawForeground;
  nodeType.prototype.onDrawForeground = function (ctx) {
    if (origOnDrawForeground) {
      origOnDrawForeground.call(this, ctx);
    }
    // Render the custom list UI in display mode.
    this.__promptPaletteCanvasUI?.draw(ctx);
  };
}

class PromptPaletteCanvasUI {
  static MODE = Object.freeze({
    EDIT: "edit",
    DISPLAY: "display",
  });
  static ACTION = Object.freeze({
    TOGGLE: "toggle",
    WEIGHT_PLUS: "weight_plus",
    WEIGHT_MINUS: "weight_minus",
  });

  #node;
  #textWidget;
  #app;
  #mode;
  #clickableAreas;
  #toggleButton;

  constructor(node, textWidget, app) {
    this.#node = node;
    this.#textWidget = textWidget;
    this.#app = app;
    this.#mode = PromptPaletteCanvasUI.MODE.DISPLAY;
    this.#clickableAreas = [];
    this.#toggleButton = null;

    this.#hideTextWidget();
    this.#addToggleButton();
    this.#attachClickHandler();
  }

  draw(ctx) {
    if (this.#mode !== PromptPaletteCanvasUI.MODE.DISPLAY) {
      return;
    }
    this.#drawCheckboxList(ctx);
  }

  // ========================================
  // Mode Management
  // ========================================
  #changeMode(mode) {
    this.#mode = mode;
    this.#applyMode();
  }

  #applyMode() {
    this.#updateTextWidgetVisibility();
    this.#updateToggleButtonLabel();
    this.#app.graph.setDirtyCanvas(true);
  }

  #updateTextWidgetVisibility() {
    if (!this.#textWidget) return;
    if (this.#mode === PromptPaletteCanvasUI.MODE.EDIT) {
      showWidget(this.#textWidget);
    } else {
      hideWidgetAndKeepSpace(this.#textWidget);
    }
  }

  #updateToggleButtonLabel() {
    if (!this.#toggleButton) return;
    this.#toggleButton.name =
      this.#mode === PromptPaletteCanvasUI.MODE.EDIT ? "Save" : "Edit";
  }

  // ========================================
  // Widget Management
  // ========================================
  #hideTextWidget() {
    hideWidgetAndKeepSpace(this.#textWidget);
  }

  #addToggleButton() {
    this.#toggleButton = this.#node.addWidget(
      "button",
      "Edit",
      "edit_text",
      () => {
        this.#changeMode(
          this.#mode === PromptPaletteCanvasUI.MODE.EDIT
            ? PromptPaletteCanvasUI.MODE.DISPLAY
            : PromptPaletteCanvasUI.MODE.EDIT,
        );
      },
    );

    const spacer = this.#node.addWidget("text", "", "");
    spacer.computeSize = () => [0, 6];
    spacer.draw = () => {};
    spacer.serialize = false;
  }

  // ========================================
  // Click Handling
  // ========================================
  #attachClickHandler() {
    const self = this;
    this.#node.onMouseDown = function (e, pos) {
      self.#handleMouseDown(pos);
    };
  }

  #handleMouseDown(pos) {
    if (this.#mode === PromptPaletteCanvasUI.MODE.EDIT) {
      return;
    }
    const clickedArea = this.#findClickedArea(pos);
    if (clickedArea) {
      this.#handleClickableAreaAction(clickedArea);
    }
  }

  #findClickedArea(pos) {
    const [x, y] = pos;
    for (const area of this.#clickableAreas) {
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

  #handleClickableAreaAction(area) {
    switch (area.action) {
      case PromptPaletteCanvasUI.ACTION.TOGGLE:
        this.#toggleLine(area.lineIndex);
        break;
      case PromptPaletteCanvasUI.ACTION.WEIGHT_PLUS:
        this.#adjustLineWeight(area.lineIndex, 0.1);
        break;
      case PromptPaletteCanvasUI.ACTION.WEIGHT_MINUS:
        this.#adjustLineWeight(area.lineIndex, -0.1);
        break;
    }
  }

  // ========================================
  // Data Operations
  // ========================================
  #toggleLine(lineIndex) {
    const textLines = this.#textWidget.value.split("\n");
    if (lineIndex < 0 || lineIndex >= textLines.length) return;

    const line = new Line(textLines[lineIndex]);
    line.toggleComment();
    textLines[lineIndex] = line.buildText();
    this.#textWidget.value = textLines.join("\n");
    this.#app.graph.setDirtyCanvas(true);
  }

  #adjustLineWeight(lineIndex, delta) {
    const textLines = this.#textWidget.value.split("\n");
    if (lineIndex < 0 || lineIndex >= textLines.length) return;

    const line = new Line(textLines[lineIndex]);
    line.adjustWeight(delta);
    textLines[lineIndex] = line.buildText();
    this.#textWidget.value = textLines.join("\n");
    this.#app.graph.setDirtyCanvas(true);
  }

  // ========================================
  // Drawing
  // ========================================
  #drawCheckboxList(ctx) {
    if (this.#node.flags && this.#node.flags.collapsed) {
      return;
    }

    const text = this.#textWidget.value || "";
    const lines = text.split("\n");
    const textHeight = calculateNodeHeight(lines.length, CONFIG);

    if (this.#node.size[1] < textHeight) {
      this.#node.size[1] = textHeight;
      this.#app.graph.setDirtyCanvas(true);
    }

    if (text.trim() !== "") {
      this.#drawCheckboxItems(ctx, lines);
    } else {
      this.#drawEmptyMessage(ctx);
    }
  }

  #drawEmptyMessage(ctx) {
    ctx.fillStyle = getColors().inactiveTextColor;
    ctx.font = `${CONFIG.fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("No Text", this.#node.size[0] / 2, this.#node.size[1] / 2);
  }

  #drawCheckboxItems(ctx, lines) {
    this.#clickableAreas = [];

    lines.forEach((lineText, index) => {
      const line = new Line(lineText);
      if (line.isPhraseTextEmpty()) return;

      const y = CONFIG.topNodePadding + index * CONFIG.lineHeight;
      const isCommented = line.isCommented;

      this.#drawCheckbox(ctx, y, isCommented, index);
      this.#drawDisplayText(ctx, line, y, isCommented);
      this.#drawWeightControls(ctx, y, line, isCommented, index);
    });
  }

  #drawCheckbox(ctx, y, isCommented, lineIndex) {
    const checkboxX = CONFIG.sideNodePadding;
    const checkboxY = y;
    const checkboxW = CONFIG.checkboxSize;
    const checkboxH = CONFIG.checkboxSize;

    this.#clickableAreas.push({
      x: checkboxX,
      y: checkboxY,
      w: checkboxW,
      h: checkboxH,
      type: "checkbox",
      lineIndex: lineIndex,
      action: PromptPaletteCanvasUI.ACTION.TOGGLE,
    });

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

  #drawDisplayText(ctx, line, y, isCommented) {
    const colors = getColors();
    ctx.fillStyle = isCommented
      ? colors.inactiveTextColor
      : colors.defaultTextColor;
    ctx.textAlign = "left";

    const isBold = line.weight !== 1.0;

    ctx.font = isBold
      ? `bold ${CONFIG.fontSize}px sans-serif`
      : `${CONFIG.fontSize}px sans-serif`;

    const checkboxCenter = y + CONFIG.checkboxSize / 2;
    const textBaseline = checkboxCenter + CONFIG.fontSize * 0.35;

    const textX =
      CONFIG.sideNodePadding + CONFIG.checkboxSize + CONFIG.checkboxAndTextGap;

    // Calculate width of right-side elements
    const rightElementsWidth =
      CONFIG.weightLabelWidth +
      CONFIG.weightLabelAndButtonGap +
      CONFIG.weightButtonSize +
      CONFIG.weightButtonGap +
      CONFIG.weightButtonSize +
      CONFIG.sideNodePadding;
    const availableWidth = this.#node.size[0] - textX - rightElementsWidth;

    // Clip text to available width
    ctx.save();
    ctx.beginPath();
    ctx.rect(textX, y, availableWidth, CONFIG.lineHeight);
    ctx.clip();

    ctx.fillText(line.getDisplayText(), textX, textBaseline);

    ctx.restore();
  }

  #drawWeightControls(ctx, y, line, isCommented, lineIndex) {
    const nodeWidth = this.#node.size[0];
    if (line.isPhraseTextEmpty()) return;

    const weightText = line.getWeightText();
    const checkboxCenter = y + CONFIG.checkboxSize / 2;

    let currentX = nodeWidth - CONFIG.sideNodePadding;

    const plusButtonX = currentX - CONFIG.weightButtonSize;
    const plusButtonY = y;
    this.#drawWeightButton(
      ctx,
      plusButtonX,
      plusButtonY,
      "+",
      lineIndex,
      PromptPaletteCanvasUI.ACTION.WEIGHT_PLUS,
    );
    currentX = plusButtonX - CONFIG.weightButtonGap;

    const minusButtonX = currentX - CONFIG.weightButtonSize;
    const minusButtonY = y;
    this.#drawWeightButton(
      ctx,
      minusButtonX,
      minusButtonY,
      "-",
      lineIndex,
      PromptPaletteCanvasUI.ACTION.WEIGHT_MINUS,
    );
    currentX = minusButtonX - CONFIG.weightButtonGap;

    if (line.weight !== 1.0) {
      const textColors = getColors();
      ctx.fillStyle = isCommented
        ? textColors.inactiveTextColor
        : textColors.defaultTextColor;
      ctx.textAlign = "right";
      ctx.font = `${CONFIG.fontSize}px sans-serif`;
      const textBaseline = checkboxCenter + CONFIG.fontSize * 0.35;
      ctx.fillText(
        weightText,
        currentX - CONFIG.weightLabelAndButtonGap,
        textBaseline,
      );
      ctx.textAlign = "left";
    }
  }

  #drawWeightButton(ctx, x, y, symbol, lineIndex, action) {
    const buttonSize = CONFIG.weightButtonSize;

    this.#clickableAreas.push({
      x: x,
      y: y,
      w: buttonSize,
      h: buttonSize,
      type: "weight_button",
      lineIndex: lineIndex,
      action: action,
    });

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
