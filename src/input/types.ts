// One sample of both sticks. y is positive upward. la/ra are 1 while a thumb is down.
export interface InputFrame {
  lx: number;
  ly: number;
  la: 0 | 1;
  rx: number;
  ry: number;
  ra: 0 | 1;
}

export const EMPTY_FRAME: InputFrame = { lx: 0, ly: 0, la: 0, rx: 0, ry: 0, ra: 0 };
