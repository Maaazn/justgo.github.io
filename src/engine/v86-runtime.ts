/**
 * JustGo Local Engine design: this bridge starts an actual v86 x86 runtime
 * inside the visitor's browser. It never labels a legacy image as Windows 10.
 */
import { V86, type V86Image } from "v86";
import wasmUrl from "v86/build/v86.wasm?url";
import type { LocalLaunchRequest, RuntimeBridge } from "./contracts";
import { configureInputSurface, type InputProfile } from "./input-control";

const V86_BIOS_URL = "https://raw.githubusercontent.com/copy/v86/master/bios/seabios.bin";
const V86_VGA_BIOS_URL = "https://raw.githubusercontent.com/copy/v86/master/bios/vgabios.bin";

function prepareScreen(mount: HTMLElement): HTMLElement {
  const screen = document.createElement("div");
  screen.className = "v86-screen";

  const textLayer = document.createElement("div");
  textLayer.className = "v86-text-layer";
  textLayer.style.whiteSpace = "pre";
  textLayer.style.font = "14px/14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

  const canvas = document.createElement("canvas");
  canvas.className = "v86-canvas";
  canvas.style.display = "none";

  screen.append(textLayer, canvas);
  mount.replaceChildren(screen);
  return screen;
}

function requireBootableImage(request: LocalLaunchRequest): LocalLaunchRequest["image"] {
  if (request.image.localFile) return request.image;
  if (!request.image.imageUrl) {
    throw new Error("هذه البيئة لم تُرفق لها صورة إقلاع تم التحقق منها بعد.");
  }
  if (request.image.supportLevel === "not-bundled") {
    throw new Error("لا يمكن تشغيل بيئة غير مختبرة أو غير مرفقة من كتالوج JustGo.");
  }
  return request.image;
}

export class V86LocalRuntime implements RuntimeBridge {
  private emulator?: V86;
  inputProfile?: InputProfile;

  async boot(request: LocalLaunchRequest, mount: HTMLElement): Promise<void> {
    await this.stop();
    const image = requireBootableImage(request);
    const screen = prepareScreen(mount);
    this.inputProfile = configureInputSurface(screen);
    const media: V86Image = image.localFile
      ? { buffer: await image.localFile.arrayBuffer() }
      : { url: image.imageUrl! };

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        reject(new Error(message));
      };

      const emulator = new V86({
        wasm_path: wasmUrl,
        memory_size: request.viewport.memoryMiB * 1024 * 1024,
        vga_memory_size: 8 * 1024 * 1024,
        bios: { url: V86_BIOS_URL },
        vga_bios: { url: V86_VGA_BIOS_URL },
        ...(image.format === "cdrom" ? { cdrom: media } : { hda: media }),
        screen: {
          container: screen,
          use_graphical_text: true,
          scaling: 1,
        },
        autostart: true,
        disable_speaker: true,
        disable_keyboard: false,
        disable_mouse: false,
      });

      this.emulator = emulator;
      emulator.add_listener("emulator-ready", () => {
        if (settled) return;
        settled = true;
        resolve();
      });
      emulator.add_listener("download-error", (error) => {
        fail(`تعذر تحميل أصل تشغيل محلي: ${error.file_name}`);
      });
      window.setTimeout(() => fail("انتهت مهلة تجهيز المحرك المحلي. تحقق من الاتصال ثم أعد المحاولة."), 45_000);
    });
  }

  async stop(): Promise<void> {
    if (!this.emulator) return;
    const emulator = this.emulator;
    this.emulator = undefined;
    this.inputProfile = undefined;
    await emulator.stop();
    await emulator.destroy();
  }

  async saveState(): Promise<Uint8Array> {
    if (!this.emulator) {
      throw new Error("لا توجد جلسة محلية نشطة لحفظ حالتها.");
    }
    return new Uint8Array(await this.emulator.save_state());
  }
}
