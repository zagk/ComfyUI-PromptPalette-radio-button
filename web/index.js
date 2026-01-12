import { app } from "../../scripts/app.js";
import { setupCanvasUI } from "./canvas_ui.js";
import { refreshDomUI, setupDomUI } from "./dom_ui.js";

const CONFIG = {
  minNodeHeight: 80,
  topNodePadding: 40,
  sideNodePadding: 14,
  lineHeight: 24,
  fontSize: 14,
  checkboxSize: 16,
  spaceBetweenCheckboxAndText: 6,
  weightButtonSize: 16,
  weightLabelWidth: 24,
  domFooterHeight: 36,
  minWeight: 0.1,
  maxWeight: 2.0,
};

app.registerExtension({
  name: "PromptPalette",

  async beforeRegisterNodeDef(nodeType, nodeData, app) {
    if (nodeData.name === "PromptPalette") {
      if (isVueNodesMode()) {
        setupDomUI(nodeType, CONFIG, app);
      } else {
        setupCanvasUI(nodeType, CONFIG, app);
      }
    }
  },

  loadedGraphNode(node, app) {
    const nodeType = node?.comfyClass || node?.type;
    if (nodeType !== "PromptPalette") {
      return;
    }
    if (isVueNodesMode()) {
      refreshDomUI(node);
    }
  },
});

function isVueNodesMode() {
  if (typeof window === "undefined") {
    return false;
  }
  return !!(window.LiteGraph && window.LiteGraph.vueNodesMode);
}
