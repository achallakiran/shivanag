import { EMPTY_FRAME, type InputFrame } from './types';

// [tick, lx, ly, la, rx, ry, ra]. Rows are stored only when the input changes.
export type FrameRow = [number, number, number, number, number, number, number];

export interface Recording {
  format: 'voxel-cricket-input';
  version: 1;
  stepHz: number;
  ticks: number; // number of steps covered
  truncated: boolean; // true if the cap was hit, so the recording is incomplete
  frames: FrameRow[];
}

const same = (a: InputFrame, b: InputFrame) =>
  a.lx === b.lx && a.ly === b.ly && a.la === b.la && a.rx === b.rx && a.ry === b.ry && a.ra === b.ra;

export class InputRecorder {
  private frames: FrameRow[] = [];
  private last: InputFrame | null = null;
  ticks = 0;
  truncated = false;

  constructor(
    private stepHz: number,
    private maxFrames = 150_000,
  ) {}

  push(tick: number, f: InputFrame): void {
    this.ticks = tick + 1;
    if (this.last && same(this.last, f)) return;
    if (this.frames.length >= this.maxFrames) {
      this.truncated = true;
      return;
    }
    this.frames.push([tick, f.lx, f.ly, f.la, f.rx, f.ry, f.ra]);
    this.last = { ...f };
  }

  toRecording(): Recording {
    return {
      format: 'voxel-cricket-input',
      version: 1,
      stepHz: this.stepHz,
      ticks: this.ticks,
      truncated: this.truncated,
      frames: this.frames.slice(),
    };
  }
}

// Feeds a recording back one tick at a time. Call frameAt with increasing ticks.
export class InputReplayer {
  private i = 0;
  private cur: InputFrame = { ...EMPTY_FRAME };

  constructor(private rec: Recording) {}

  frameAt(tick: number): InputFrame {
    const rows = this.rec.frames;
    while (this.i < rows.length && rows[this.i][0] <= tick) {
      const r = rows[this.i++];
      this.cur = { lx: r[1], ly: r[2], la: r[3] as 0 | 1, rx: r[4], ry: r[5], ra: r[6] as 0 | 1 };
    }
    return this.cur;
  }
}
