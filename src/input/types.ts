// One sample of the player's input. `sel` is the stance chosen with the buttons (0 = Ready).
// rx/ry/ra are a placeholder for the swing until swipes arrive: ra is 1 while a thumb is down.
export interface InputFrame {
  sel: number;
  rx: number;
  ry: number;
  ra: 0 | 1;
}

export const EMPTY_FRAME: InputFrame = { sel: 0, rx: 0, ry: 0, ra: 0 };
