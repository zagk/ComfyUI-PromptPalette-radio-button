import { Line } from "./line.js";

export class TextLines {
  #lines;

  constructor(text) {
    this.#lines = text.split("\n");
  }

  // 라디오 버튼 로직: 선택한 인덱스만 활성화하고 나머지는 모두 주석 처리
  selectLineAt(index) {
    this.#lines = this.#lines.map((lineText, i) => {
      const line = new Line(lineText);
      if (!line.hasPhraseText()) return lineText; // 빈 줄은 건너뜀

      if (i === index) {
        // 클릭한 라인: 주석이 있으면 제거
        if (line.commentedOut) {
          line.toggleCommentedOut();
        }
      } else {
        // 클릭하지 않은 라인: 주석이 없으면 추가
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
