import { Line } from "./line.js";

export class TextLines {
  #lines;

  constructor(text) {
    this.#lines = text.split("\n");
  }

  // 
  selectLineAt(index) {
    this.#lines = this.#lines.map((lineText, i) => {
      const line = new Line(lineText);
      if (!line.hasPhraseText()) return lineText; // 

      if (i === index) {
        //
        if (line.commentedOut) {
          line.toggleCommentedOut();
        }
      } else {
        // 
        if (!line.commentedOut) {
          line.toggleCommentedOut();
        }
      }
      return line.buildText();
    });
  }

  adjustWeightAt(index, delta) {
    const line = this.#getLineAt(index);
    if (!line) return;
    line.adjustWeight(delta);
    this.#lines[index] = line.buildText();
  }

  #getLineAt(index) {
    if (index < 0 || index >= this.#lines.length) return null;
    return new Line(this.#lines[index]);
  }

  toString() {
    return this.#lines.join("\n");
  }
}
