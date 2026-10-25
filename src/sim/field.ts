// Field geometry shared by the sim and the renderer. Metres.
// View frame: X is screen-right as seen from the bowler's end, Y up, Z toward the bowler.
export const PITCH_LEN = 20.12;
export const BAT_Z = -PITCH_LEN / 2 + 1.22; // batting crease
export const STUMPS_Z = -PITCH_LEN / 2; // batting stumps
export const PITCH_HALF_WIDTH = 1.525;
export const PITCH_HALF_LEN = (PITCH_LEN + 2.44) / 2;
