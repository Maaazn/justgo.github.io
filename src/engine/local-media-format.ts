/** Infers the boot attachment type from a visitor-selected local filename. */
export type LocalMediaFormat = "hard-disk" | "cdrom";

export function inferLocalMediaFormat(fileName: string): LocalMediaFormat {
  return /\.iso$/i.test(fileName.trim()) ? "cdrom" : "hard-disk";
}

export function localMediaFormatMessage(fileName: string, format: LocalMediaFormat): string {
  if (format === "cdrom") {
    return `اكتُشف ${fileName} كصورة ISO؛ سيُربط كقرص مدمج / CD-ROM.`;
  }
  return `سيُربط ${fileName} كقرص صلب / IMG.`;
}
