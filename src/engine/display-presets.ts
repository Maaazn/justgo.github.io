/** Display targets shape the host surface; the guest VGA driver still chooses its real mode. */
export type DisplayPresetId = "xga" | "hd" | "full-hd" | "qhd" | "uhd-4k";

export interface DisplayPreset {
  readonly id: DisplayPresetId;
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

export const DISPLAY_PRESETS: readonly DisplayPreset[] = [
  { id: "xga", label: "XGA — 1024×768", width: 1024, height: 768 },
  { id: "hd", label: "HD — 1280×720", width: 1280, height: 720 },
  { id: "full-hd", label: "Full HD — 1920×1080", width: 1920, height: 1080 },
  { id: "qhd", label: "QHD — 2560×1440", width: 2560, height: 1440 },
  { id: "uhd-4k", label: "4K UHD — 3840×2160", width: 3840, height: 2160 },
];

export function displayPreset(id: DisplayPresetId): DisplayPreset {
  return DISPLAY_PRESETS.find((preset) => preset.id === id) ?? DISPLAY_PRESETS[0]!;
}
