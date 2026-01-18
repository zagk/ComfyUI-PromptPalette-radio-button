const COMMENT_PREFIX = "// ";
const LINE_RE = /^(\s*\/\/\s*)?(.*?)(\/\/.*)?$/;
const WEIGHT_RE = /^\((.+):(\d+\.?\d*)\)$/;

export class Line {
  #isCommentedOut;
  #phraseText;
  #trailingComment;
  #weight;

  constructor(rawText = "") {
    const [, commentPrefix, body, trailingComment] = rawText.match(LINE_RE);
    this.#isCommentedOut = !!commentPrefix;
    this.#trailingComment = trailingComment ?? "";

    const { phrase, weight } = this.#parseWeightedText(body);
    this.#phraseText = phrase;
    this.#weight = weight;
  }

  #parseWeightedText(text) {
    const cleanText = text.trim().replace(/,\s*$/, "");
    const match = cleanText.match(WEIGHT_RE);
    if (match) {
      return { phrase: match[1], weight: parseFloat(match[2]) || 1.0 };
    }
    return { phrase: cleanText, weight: 1.0 };
  }

  get isCommentedOut() {
    return this.#isCommentedOut;
  }

  toggleCommentedOut() {
    this.#isCommentedOut = !this.#isCommentedOut;
  }

  get displayText() {
    if (this.#trailingComment) {
      return `${this.#phraseText} ${this.#trailingComment}`;
    }
    return this.#phraseText;
  }

  isPhraseTextEmpty() {
    return this.#phraseText.trim() === "";
  }

  get weightText() {
    // Round to 2 decimal places first
    const rounded = Math.round(this.#weight * 100) / 100;
    // If the value has a non-zero second decimal place, show 2 decimals
    if (rounded * 10 !== Math.floor(rounded * 10)) {
      return rounded.toFixed(2);
    }
    // Otherwise show 1 decimal
    return rounded.toFixed(1);
  }

  get weight() {
    return this.#weight;
  }

  adjustWeight(delta) {
    const minWeight = 0.1;
    const maxWeight = 2.0;
    const newWeight = this.#weight + delta;
    const clampedWeight = Math.min(maxWeight, Math.max(minWeight, newWeight));
    this.#weight = Math.round(clampedWeight * 10) / 10;
  }

  buildText() {
    const weightedText = this.#buildWeightedText(this.#phraseText, this.#weight);
    const textWithTrailingComment = this.#trailingComment
      ? `${weightedText} ${this.#trailingComment}`
      : weightedText;
    return this.#isCommentedOut
      ? COMMENT_PREFIX + textWithTrailingComment
      : textWithTrailingComment;
  }

  #buildWeightedText(phraseText, weight) {
    if (weight === 1.0) {
      return phraseText;
    }
    return `(${phraseText}:${weight})`;
  }
}
