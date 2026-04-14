import { Line } from "./line.js";
import {
  calculateNodeHeight,
  findDelimiterWidget,
  findLineBreakWidget,
  findTextWidget,
  hideWidget,
  hideWidgetAndKeepSpace,
  showWidget,
  validateDelimiterValue,
  validateLineBreakValue,
} from "./ui_utils.js";
import { TextLines } from "./text_lines.js";

const CONFIG = {
  minNodeHeight: 80,
  topNodePadding: 40,
  sideNodePadding: 14,
  lineHeight: 24,
  fontSize: 13,
  checkboxSize: 16, // ���� ��ư ũ��� ���� ���
  checkboxMarginRight: 6,
  weightLabelWidth: 34,
  weightLabelMarginRight: 2,
  weightButtonSize: 16,
  weightButtonGap: 4,
};

let colorCache = null;

export function setupCanvasUI(nodeType, app) {
  if (nodeType.prototype.__nodeTypeInitialized) return;
  nodeType.prototype.__nodeTypeInitialized = true;

  const origOnNodeCreated = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function () {
    if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);
    if (this.__nodeInitialized) return;
    this.__nodeInitialized = true;

    const textWidget = findTextWidget(this);
    if (textWidget) {
      this.__promptPaletteCanvasUI = new PromptPaletteCanvasUI(this, textWidget, app);
    }
  };

  const origOnConfigure = nodeType.prototype.onConfigure;
  nodeType.prototype.onConfigure = function (data) {
    if (origOnConfigure) origOnConfigure.call(this, data);
    validateDelimiterValue(findDelimiterWidget(this));
    validateLineBreakValue(findLineBreakWidget(this));
  };

  const origOnDrawForeground = nodeType.prototype.onDrawForeground;
  nodeType.prototype.onDrawForeground = function (ctx) {
    if (origOnDrawForeground) origOnDrawForeground.call(this, ctx);
    this.__promptPaletteCanvasUI?.draw(ctx);
  };
}

class PromptPaletteCanvasUI {
  static MODE = Object.freeze({ EDIT: "edit", DISPLAY: "display" });
  static ACTION = Object.freeze({
    RADIO_SELECT: "radio_select", // �׼Ǹ� ����
    WEIGHT_PLUS: "weight_plus",
    WEIGHT_MINUS: "weight_minus",
  });

  #node; #textWidget; #delimiterWidget; #lineBreakWidget; #app; #mode; #clickableAreas; #toggleButton;

  constructor(node, textWidget, app) {
    this.#node = node;
    this.#textWidget = textWidget;
    this.#delimiterWidget = findDelimiterWidget(node);
    this.#lineBreakWidget = findLineBreakWidget(node);
    this.#app = app;
    this.#mode = PromptPaletteCanvasUI.MODE.DISPLAY;
    this.#clickableAreas = [];
    this.#toggleButton = null;

    hideWidgetAndKeepSpace(this.#textWidget);
    hideWidget(this.#delimiterWidget);
    hideWidget(this.#lineBreakWidget);
    this.#addToggleButton();
    this.#attachClickHandler();
  }

  draw(ctx) {
    if (this.#mode !== PromptPaletteCanvasUI.MODE.DISPLAY) return;
    this.#drawRadioList(ctx);
  }

  #changeMode(mode) {
    this.#mode = mode;
    this.#updateWidgetVisibility();
    this.#updateToggleButtonLabel();
    this.#app.graph.setDirtyCanvas(true);
  }

  #updateWidgetVisibility() {
    const isEdit = this.#mode === PromptPaletteCanvasUI.MODE.EDIT;
    if (isEdit) {
      showWidget(this.#textWidget); showWidget(this.#delimiterWidget); showWidget(this.#lineBreakWidget);
    } else {
      hideWidgetAndKeepSpace(this.#textWidget); hideWidget(this.#delimiterWidget); hideWidget(this.#lineBreakWidget);
    }
  }

  #updateToggleButtonLabel() {
    if (!this.#toggleButton) return;
    this.#toggleButton.name = this.#mode === PromptPaletteCanvasUI.MODE.EDIT ? "Save" : "Edit";
  }

  #addToggleButton() {
    this.#toggleButton = this.#node.addWidget("button", "Edit", "edit_text", () => {
      this.#changeMode(this.#mode === PromptPaletteCanvasUI.MODE.EDIT ? PromptPaletteCanvasUI.MODE.DISPLAY : PromptPaletteCanvasUI.MODE.EDIT);
    });
    this.#toggleButton.serialize = false;
    const spacer = this.#node.addWidget("text", "", "");
    spacer.computeSize = () => [0, 6];
    spacer.draw = () => {};
    spacer.serialize = false;
  }

  #attachClickHandler() {
    const self = this;
    this.#node.onMouseDown = function (e, pos) { self.#handleMouseDown(pos); };
  }

  #handleMouseDown(pos) {
    if (this.#mode === PromptPaletteCanvasUI.MODE.EDIT) return;
    const area = this.#findClickedArea(pos);
    if (area) this.#handleClickableAreaAction(area);
  }

  #findClickedArea(pos) {
    const [x, y] = pos;
    return this.#clickableAreas.find(a => x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) || null;
  }

  #handleClickableAreaAction(area) {
    switch (area.action) {
      case PromptPaletteCanvasUI.ACTION.RADIO_SELECT:
        this.#selectSingleLine(area.lineIndex);
        break;
      case PromptPaletteCanvasUI.ACTION.WEIGHT_PLUS:
        this.#adjustLineWeight(area.lineIndex, 0.1);
        break;
      case PromptPaletteCanvasUI.ACTION.WEIGHT_MINUS:
        this.#adjustLineWeight(area.lineIndex, -0.1);
        break;
    }
  }

  #selectSingleLine(lineIndex) {
    const textLines = new TextLines(this.#textWidget.value);
    textLines.selectLineAt(lineIndex); // ���� �޼��� ȣ��
    this.#textWidget.value = textLines.toString();
    this.#app.graph.setDirtyCanvas(true);
  }

  #adjustLineWeight(lineIndex, delta) {
    const textLines = new TextLines(this.#textWidget.value);
    textLines.adjustWeightAt(lineIndex, delta);
    this.#textWidget.value = textLines.toString();
    this.#app.graph.setDirtyCanvas(true);
  }

  #drawRadioList(ctx) {
    if (this.#node.flags?.collapsed) return;
    const text = this.#textWidget.value || "";
    const lines = text.split("\n");
    const textHeight = calculateNodeHeight(lines.length, CONFIG);
    if (this.#node.size[1] < textHeight) {
      this.#node.size[1] = textHeight;
      this.#app.graph.setDirtyCanvas(true);
    }
    if (text.trim() !== "") this.#drawRadioItems(ctx, lines);
    else this.#drawEmptyMessage(ctx);
  }

  #drawEmptyMessage(ctx) {
    ctx.fillStyle = getColors().inactiveTextColor;
    ctx.font = `${CONFIG.fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("No Text", this.#node.size[0] / 2, this.#node.size[1] / 2);
  }

  #drawRadioItems(ctx, lines) {
    this.#clickableAreas = [];
    lines.forEach((lineText, index) => {
      const line = new Line(lineText);
      if (!line.hasPhraseText()) return;
      const y = CONFIG.topNodePadding + index * CONFIG.lineHeight;
      this.#drawRadioButton(ctx, line, y, index);
      this.#drawDisplayText(ctx, line, y);
      this.#drawWeightControls(ctx, line, y, index);
    });
  }

  #drawRadioButton(ctx, line, y, index) {
    const size = CONFIG.checkboxSize;
    const x = CONFIG.sideNodePadding;
    this.#clickableAreas.push({ x, y, w: size, h: size, lineIndex: index, action: PromptPaletteCanvasUI.ACTION.RADIO_SELECT });

    const centerX = x + size / 2;
    const centerY = y + size / 2;
    const radius = size / 2;

    // �ܰ� ��
    ctx.strokeStyle = getColors().checkboxBorderColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();

    // ���� �� ���� �� ä��
    if (!line.commentedOut) {
      ctx.fillStyle = getColors().checkboxFillColor;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  #drawDisplayText(ctx, line, y) {
    const colors = getColors();
    ctx.fillStyle = line.commentedOut ? colors.inactiveTextColor : colors.defaultTextColor;
    ctx.textAlign = "left";
    ctx.font = `${line.weight !== 1.0 ? "bold " : ""}${CONFIG.fontSize}px sans-serif`;
    const textX = CONFIG.sideNodePadding + CONFIG.checkboxSize + CONFIG.checkboxMarginRight;
    const rightWidth = CONFIG.weightLabelWidth + CONFIG.weightLabelMarginRight + (CONFIG.weightButtonSize * 2) + CONFIG.weightButtonGap + CONFIG.sideNodePadding;
    
    ctx.save();
    ctx.beginPath();
    ctx.rect(textX, y, this.#node.size[0] - textX - rightWidth, CONFIG.lineHeight);
    ctx.clip();
    ctx.fillText(line.displayText, textX, y + CONFIG.checkboxSize / 2 + CONFIG.fontSize * 0.35);
    ctx.restore();
  }

  #drawWeightControls(ctx, line, y, index) {
    if (!line.hasPhraseText()) return;
    let currentX = this.#node.size[0] - CONFIG.sideNodePadding;
    
    // + ��ư
    const pX = currentX - CONFIG.weightButtonSize;
    this.#drawWeightButton(ctx, pX, y, "+", index, PromptPaletteCanvasUI.ACTION.WEIGHT_PLUS);
    currentX = pX - CONFIG.weightButtonGap;

    // - ��ư
    const mX = currentX - CONFIG.weightButtonSize;
    this.#drawWeightButton(ctx, mX, y, "-", index, PromptPaletteCanvasUI.ACTION.WEIGHT_MINUS);
    currentX = mX - CONFIG.weightButtonGap;

    if (line.weight !== 1.0) {
      ctx.fillStyle = line.commentedOut ? getColors().inactiveTextColor : getColors().defaultTextColor;
      ctx.textAlign = "right";
      ctx.font = `${CONFIG.fontSize}px sans-serif`;
      ctx.fillText(line.weightText, currentX - CONFIG.weightLabelMarginRight, y + CONFIG.checkboxSize / 2 + CONFIG.fontSize * 0.35);
    }
  }

  #drawWeightButton(ctx, x, y, symbol, lineIndex, action) {
    const size = CONFIG.weightButtonSize;
    this.#clickableAreas.push({ x, y, w: size, h: size, lineIndex, action });
    ctx.fillStyle = getColors().weightButtonFillColor;
    ctx.beginPath(); ctx.roundRect(x, y, size, size, 4); ctx.fill();
    ctx.strokeStyle = getColors().weightButtonSymbolColor;
    ctx.lineWidth = 2;
    const cX = x + size / 2, cY = y + size / 2, s = 6;
    ctx.beginPath();
    if (symbol === "+") { ctx.moveTo(cX - s / 2, cY); ctx.lineTo(cX + s / 2, cY); ctx.moveTo(cX, cY - s / 2); ctx.lineTo(cX, cY + s / 2); }
    else { ctx.moveTo(cX - s / 2, cY); ctx.lineTo(cX + s / 2, cY); }
    ctx.stroke();
  }
}

function getColors() {
  if (colorCache) return colorCache;
  const theme = getComfyUIThemeColors();
  return colorCache = {
    defaultTextColor: theme.inputText,
    inactiveTextColor: theme.inputText + "66",
    checkboxBorderColor: theme.inputText + "80",
    checkboxFillColor: theme.inputText,
    checkboxSymbolColor: theme.comfyInputBg,
    weightButtonFillColor: theme.comfyInputBg,
    weightButtonSymbolColor: theme.inputText + "99",
  };
}

function getComfyUIThemeColors() {
  const style = getComputedStyle(document.documentElement);
  const expand = (c) => (c && c.startsWith("#") && c.length === 4) ? "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3] : c;
  return {
    comfyInputBg: expand(style.getPropertyValue("--comfy-input-bg").trim()) || "#222222",
    inputText: expand(style.getPropertyValue("--input-text").trim()) || "#dddddd",
  };
}
