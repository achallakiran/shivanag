// One sample of the player's input, held until it changes.
// sel: the stance chosen with the buttons (0 = Ready).
// n, dx, dy, sp: the latest swipe. n counts swipes (a new number means a new swipe); (dx, dy) is the unit swipe
// direction in screen terms (dy grows downward); sp is its speed in screen heights per second.
export interface InputFrame {
  sel: number;
  n: number;
  dx: number;
  dy: number;
  sp: number;
}

export const EMPTY_FRAME: InputFrame = { sel: 0, n: 0, dx: 0, dy: 0, sp: 0 };
