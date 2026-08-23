import type { Ps2Controller, Ps2MouseMotion } from "../core16/ps2";

export type DeterministicInputEvent =
  | { readonly kind: "keyboard"; readonly scanCode: number }
  | { readonly kind: "mouse"; readonly motion: Ps2MouseMotion };

/** Host input is queued without clocks and delivered only at a scheduler tick. */
export class DeterministicPs2Input {
  private readonly pending: DeterministicInputEvent[] = [];

  constructor(private readonly controller: Ps2Controller) {}

  enqueue(event: DeterministicInputEvent): void { this.pending.push(event); }

  deliver(): readonly DeterministicInputEvent[] {
    const batch = this.pending.splice(0);
    for (const event of batch) {
      if (event.kind === "keyboard") this.controller.enqueueScanCode(event.scanCode);
      else this.controller.enqueueMouseMotion(event.motion);
    }
    return batch;
  }
}
