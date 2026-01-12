const COMMENT_PREFIX_RE = /^\s*\/\/\s*/;

export function findTextWidget(node) {
  if (!node || !node.widgets) return null;
  for (const w of node.widgets) {
    if (w.name === "text") {
      return w;
    }
  }
  return null;
}

export function setWidgetVisibility(widget, visible, options = {}) {
  if (!widget) return;
  const keepLayout = options.keepLayout === true;
  if (keepLayout) {
    widget.hidden = false;
    if (widget.options) {
      widget.options.hidden = false;
    }
  } else {
    widget.hidden = !visible;
    if (widget.options) {
      widget.options.hidden = !visible;
    }
  }
  widget.disabled = !visible;
  widget.computedDisabled = !visible;
  const el = widget.element || widget.inputEl;
  if (!el || !el.style) return;
  el.style.display = visible ? "" : "none";
  el.style.pointerEvents = visible ? "" : "none";
}

export function isEmptyLine(line) {
  return line.trim() === "";
}

export function isLineCommented(line) {
  return line.trim().startsWith("//");
}

export function toggleCommentOnLine(textLines, lineIndex) {
  const line = textLines[lineIndex];
  if (isLineCommented(line)) {
    textLines[lineIndex] = line.replace(COMMENT_PREFIX_RE, "");
  } else {
    textLines[lineIndex] = "// " + line;
  }
}

export function removeLeadingCommentPrefix(
  line,
  isCommented = isLineCommented(line),
) {
  if (!isCommented) {
    return line;
  }
  const match = line.match(/^(\s*\/\/\s*)(.*)/);
  return match ? match[2] : "";
}

export function getPhraseText(line, isCommented = isLineCommented(line)) {
  let phraseText = line;

  if (isCommented) {
    phraseText = line.replace(COMMENT_PREFIX_RE, "");
  }

  phraseText = phraseText.replace(/\(([^:]+):(\d+\.?\d*)\)/g, "$1");

  if (phraseText.trim().endsWith(",")) {
    phraseText = phraseText.substring(0, phraseText.lastIndexOf(","));
  }

  return phraseText;
}

export function parseWeight(text) {
  const match = text.match(/\(([^:]+):(\d+\.?\d*)\)/);
  if (match) {
    const weight = parseFloat(match[2]);
    return isNaN(weight) ? 1.0 : weight;
  }
  return 1.0;
}

export function getWeightText(text) {
  const weight = parseWeight(text);
  return weight === 1.0 ? "" : weight.toFixed(1);
}

function setWeight(text, weight) {
  const cleanText = text.replace(/\(([^:]+):(\d+\.?\d*)\)/, "$1").trim();
  const textWithoutComma = cleanText.replace(/,\s*$/, "").trim();
  if (weight === 1.0) {
    return textWithoutComma;
  }
  return `(${textWithoutComma}:${weight.toFixed(1)})`;
}

function adjustWeight(text, delta, minWeight, maxWeight) {
  const currentWeight = parseWeight(text);
  const newWeight = Math.round((currentWeight + delta) * 10) / 10;

  if (newWeight < minWeight) {
    return text;
  }

  if (newWeight > maxWeight) {
    if (delta > 0) {
      return text;
    }
    return setWeight(text, maxWeight);
  }

  if (currentWeight > maxWeight && delta < 0) {
    return setWeight(text, maxWeight);
  }

  return setWeight(text, newWeight);
}

export function adjustWeightInLine(line, delta, minWeight, maxWeight) {
  if (isLineCommented(line)) {
    const commentMatch = line.match(/^(\s*\/\/\s*)(.*)/);
    if (commentMatch && commentMatch[2].trim()) {
      const adjustedText = adjustWeight(
        commentMatch[2],
        delta,
        minWeight,
        maxWeight,
      );
      return commentMatch[1] + adjustedText;
    }
    return line;
  }

  if (line.includes("//")) {
    const commentIndex = line.indexOf("//");
    const beforeComment = line.substring(0, commentIndex).trim();
    const comment = line.substring(commentIndex);

    if (beforeComment) {
      const adjustedText = adjustWeight(
        beforeComment,
        delta,
        minWeight,
        maxWeight,
      );
      return adjustedText + " " + comment;
    }
    return line;
  }

  return adjustWeight(line, delta, minWeight, maxWeight);
}

export function calculateNodeHeight(lineCount, config) {
  return Math.max(
    config.minNodeHeight,
    config.topNodePadding + lineCount * config.lineHeight + 10,
  );
}
