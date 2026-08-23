/** JustGo Core-16 design: hardware delivery is an explicit queue, separate from CPU decoding. */
export interface InterruptBus {
  nextPending(): number | undefined;
}

export class InterruptQueue implements InterruptBus {
  private readonly pending: number[] = [];

  request(vector: number): void {
    this.pending.push(vector & 0xff);
  }

  nextPending(): number | undefined {
    return this.pending.shift();
  }
}
