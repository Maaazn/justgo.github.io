# JustGo Local Engine

JustGo is an experimental, browser-local x86 guest-engine foundation. It is built as small, testable layers for CPU state, PML4 memory translation, device ports, interrupts, local guest media, deterministic scheduling, and replay.

> **Compatibility boundary:** JustGo does **not** boot Windows or Linux today. It is not a full x86 emulator, BIOS/UEFI implementation, virtual machine host, or remote-browser service. The native Core-64 path remains intentionally narrow and ring-0-only.

## What is implemented

| Area | Current scope |
|---|---|
| Core-64 | BigInt registers, PML4 4KiB translation, canonical-address checks, and a narrow REX/MOV/ALU/HLT interpreter |
| Interrupts | IDTR/IDT gates, exception and IRQ frames, IRETQ, and limited IST selection |
| Platform devices | Dual 8259A PIC, PIT, CMOS/RTC, and ATA PIO LBA28 contracts |
| Local media | User-selected `Blob`/`File` sector reads with bounded caching; no upload and no full-image RAM copy |
| Scheduling | Deterministic input → CPU → PIT → RTC → storage → PIC → video phase ordering |
| Replay | PS/2 input batch replay plus register, watched-memory, trace, and device-event divergence checks |

## Deliberate limits

The project does not implement user/kernel privilege transitions, complete hardware TSS stack switching, large pages, NX, USB guest devices, AHCI/DMA, partition/filesystem boot, a complete VGA model, or a full instruction decoder. Browser rendering uses WebGPU only as an optional presentation path with a Canvas fallback; it is not an x86 JIT.

Local guest media remains on the visitor device. Do not add Windows installers, license keys, proprietary BIOS images, or system images to this repository.

## Verification

```bash
pnpm install
pnpm check
```

`pnpm check` runs strict TypeScript checking, the Vitest suite, and a production Vite build. The repository includes a machine-readable capability manifest in [`src/lab/capability-manifest.ts`](./src/lab/capability-manifest.ts) and a concise integration review in [`docs/integration-readiness.md`](./docs/integration-readiness.md).

## Local development

```bash
pnpm dev
```

The optional v86 bridge is isolated from the native-core experiments. See [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) and [`docs/integration-asset-evaluation.md`](./docs/integration-asset-evaluation.md) before adding or changing external components.

## License and contributions

Project-owned modules and third-party boundaries are recorded in the repository notices and integration registry. Contributions should add a concrete execution contract and a corresponding test; line count, duplicated content, and large opaque assets are not accepted as progress.
