const COMMENT_PREFIX = "// ";
const COMMENT_PREFIX_AND_TEXT_RE = /^(\s*\/\/\s*)(.*)/;
const WEIGHT_RE = /\(([^:]+):(\d+\.?\d*)\)/;
const WEIGHT_RE_GLOBAL = /\(([^:]+):(\d+\.?\d*)\)/g;

export class Line {
  constructor(raw) {
    this.raw = raw ?? "";
    const trimmed = this.raw.trim();
    this.isCommented = trimmed.startsWith("//");

    const match = this.raw.match(COMMENT_PREFIX_AND_TEXT_RE);
    this.textWithoutCommentPrefix = match ? match[2] : this.raw;

    const inlineCommentSearchText = this.textWithoutCommentPrefix;
    const inlineCommentIndex = inlineCommentSearchText.indexOf("//");
    this.hasInlineComment = inlineCommentIndex !== -1;
    this.beforeInlineComment = this.hasInlineComment
      ? inlineCommentSearchText.substring(0, inlineCommentIndex).trim()
      : inlineCommentSearchText;
    this.inlineComment = this.hasInlineComment
      ? inlineCommentSearchText.substring(inlineCommentIndex)
      : "";
    this.weight = this._parseWeight(this.beforeInlineComment);
  }

  toggleComment() {
    this.isCommented = !this.isCommented;
  }

  getDisplayText() {
    // Inline comments are preserved in the display text
    let displayText = this.textWithoutCommentPrefix;
    displayText = displayText.replace(WEIGHT_RE_GLOBAL, "$1");
    if (displayText.trim().endsWith(",")) {
      displayText = displayText.substring(0, displayText.lastIndexOf(","));
    }
    return displayText;
  }

  getPhraseText() {
    let phraseText = this.beforeInlineComment;
    phraseText = phraseText.replace(WEIGHT_RE_GLOBAL, "$1");
    if (phraseText.trim().endsWith(",")) {
      phraseText = phraseText.substring(0, phraseText.lastIndexOf(","));
    }
    return phraseText;
  }

  isPhraseTextEmpty() {
    return this.getPhraseText().trim() === "";
  }

  getWeightText() {
    // Round to 2 decimal places first
    const rounded = Math.round(this.weight * 100) / 100;
    // If the value has a non-zero second decimal place, show 2 decimals
    if (rounded * 10 !== Math.floor(rounded * 10)) {
      return rounded.toFixed(2);
    }
    // Otherwise show 1 decimal
    return rounded.toFixed(1);
  }

  setWeight(weight) {
    const minWeight = 0.1;
    const maxWeight = 2.0;
    const clampedWeight = Math.min(maxWeight, Math.max(minWeight, weight));
    this.weight = Math.round(clampedWeight * 10) / 10;
  }

  adjustWeight(delta) {
    this.setWeight(this.weight + delta);
  }

  buildText() {
    const weight = this.weight;
    const weightedText = this._buildWeightedText(
      this.beforeInlineComment,
      weight,
    );
    const textWithInlineComment = this.hasInlineComment
      ? `${weightedText} ${this.inlineComment}`
      : weightedText;
    return this.isCommented
      ? COMMENT_PREFIX + textWithInlineComment
      : textWithInlineComment;
  }

  _parseWeight(text) {
    const match = text.match(WEIGHT_RE);
    if (match) {
      const weight = parseFloat(match[2]);
      return isNaN(weight) ? 1.0 : weight;
    }
    return 1.0;
  }

  _buildWeightedText(text, weight) {
    const cleanText = text.replace(WEIGHT_RE, "$1").trim();
    const textWithoutComma = cleanText.replace(/,\s*$/, "").trim();
    if (weight === 1.0) {
      return textWithoutComma;
    }
    return `(${textWithoutComma}:${weight.toFixed(1)})`;
  }
}
