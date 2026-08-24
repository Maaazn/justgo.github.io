/**
 * JustGo visual philosophy: dark technical control deck, direct asymmetry,
 * no fake Windows claims. The interface reveals actual local-engine state.
 */
import "./styles.css";
import { LOCAL_IMAGES, getImageById } from "./engine/catalog";
import type { LocalImageDescriptor, SessionState } from "./engine/contracts";
import { LocalSessionMachine } from "./engine/session-machine";
import { V86LocalRuntime } from "./engine/v86-runtime";
import { detectMemoryEnvironment, memoryLaunchMessage, memoryOptions, type GuestMemoryMiB } from "./engine/memory-policy";
import { inferLocalMediaFormat, localMediaFormatMessage } from "./engine/local-media-format";
import { DISPLAY_PRESETS, displayPreset, type DisplayPresetId } from "./engine/display-presets";

const stateLabels: Record<SessionState, string> = {
  idle: "جاهز",
  validating: "يتحقق",
  "loading-runtime": "يحمّل المحرك",
  "preparing-storage": "يجهّز التخزين",
  booting: "يقلع محلياً",
  running: "نشط على جهازك",
  stopping: "ينهي الجلسة",
  stopped: "متوقف",
  failed: "تعذر التشغيل",
};

const session = new LocalSessionMachine();
const runtime = new V86LocalRuntime();
let selectedImageId = "freedos-demo";
let localWindowsKey = "";
let selectedLocalFile: File | undefined;
let selectedLocalFormat: "hard-disk" | "cdrom" = "hard-disk";
let selectedMemoryMiB: GuestMemoryMiB = 64;
let selectedDisplayId: DisplayPresetId = "xga";

const appElement = document.querySelector<HTMLDivElement>("#app");
if (!appElement) throw new Error("لم يتم العثور على جذر تطبيق JustGo.");
const app: HTMLDivElement = appElement;

function selectedImage(): LocalImageDescriptor {
  return getImageById(selectedImageId);
}

function escapeAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function escapeText(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function selectedLaunchImage(): LocalImageDescriptor {
  const image = selectedImage();
  if (!supportsLocalMedia(image) || !selectedLocalFile) return image;
  return { ...image, format: selectedLocalFormat, localFile: selectedLocalFile, label: `${image.label} — ${selectedLocalFile.name}` };
}

function supportsLocalMedia(image: LocalImageDescriptor): boolean {
  return image.source === "user-provided" || image.id === "reactos-experimental";
}

function render(): void {
  const snapshot = session.snapshot;
  const image = selectedImage();
  const isRunning = snapshot.state === "running" || snapshot.state === "booting";
  const bootable = Boolean(image.imageUrl) || (supportsLocalMedia(image) && Boolean(selectedLocalFile));
  const inputDetail = runtime.inputProfile?.detail ?? "سيُكتشف أسلوب الماوس أو اللمس عند تشغيل الشاشة.";
  const availableMemory = memoryOptions(detectMemoryEnvironment());
  const isoSelected = selectedLocalFile ? inferLocalMediaFormat(selectedLocalFile.name) === "cdrom" : false;
  const selectedDisplay = displayPreset(selectedDisplayId);

  app.innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <a class="brand" href="#top" aria-label="JustGo Local Engine">
          <span class="brand-mark" aria-hidden="true">JG</span>
          <span><b>JustGo</b><small>Local Engine / α</small></span>
        </a>
        <div class="runtime-badge"><span class="pulse"></span> التنفيذ: جهازك، داخل المتصفح</div>
      </header>

      <section class="hero" id="top">
        <div class="hero-copy">
          <p class="eyebrow">BROWSER-NATIVE X86 LAB</p>
          <h1>شغّل بيئة <em>حقيقية محلياً</em> — لا شاشة ادعاء.</h1>
          <p class="hero-lede">JustGo يحمّل محرك x86 WebAssembly داخل متصفحك. لا نرسل ضغطاتك إلى خادم جلسات، ولا نسمي بيئة اختبار قديمة Windows 10.</p>
        </div>
        <aside class="promise-card">
          <span class="card-index">01</span>
          <strong>ما يحدث فعلاً</strong>
          <p>المعالج الافتراضي، الذاكرة، الشاشة والمدخلات تعمل في علامة تبويبك. الأصول الثقيلة تُسحب عند الحاجة فقط.</p>
        </aside>
      </section>

      <section class="control-grid" aria-label="لوحة إطلاق البيئة المحلية">
        <aside class="control-rail">
          <div class="section-label"><span>CATALOG</span><b>بيئات التشغيل</b></div>
          <div class="image-list">
            ${LOCAL_IMAGES.map((candidate) => `
              <button class="image-option ${candidate.id === image.id ? "is-selected" : ""}" data-image-id="${candidate.id}" type="button" aria-pressed="${candidate.id === image.id}">
                <span class="image-dot ${candidate.supportLevel}"></span>
                <span class="image-title">${candidate.label}</span>
                <small>${candidate.supportLevel === "verified-demo" ? "جاهز للاختبار" : candidate.supportLevel === "experimental" ? "تجريبي" : "غير مرفق"}</small>
              </button>
            `).join("")}
          </div>
          ${supportsLocalMedia(image) ? `
            <label class="local-media-field">صورة محلية (ISO أو IMG)
              <input id="local-media" type="file" accept=".iso,.img,.raw,application/x-cd-image" ${isRunning ? "disabled" : ""}>
              <select id="local-format" ${isRunning ? "disabled" : ""}><option value="hard-disk" ${selectedLocalFormat === "hard-disk" ? "selected" : ""} ${isoSelected ? "disabled" : ""}>قرص صلب / IMG</option><option value="cdrom" ${selectedLocalFormat === "cdrom" ? "selected" : ""}>قرص مدمج / ISO</option></select>
              <small>${selectedLocalFile ? `${escapeText(localMediaFormatMessage(selectedLocalFile.name, selectedLocalFormat))} (${Math.ceil(selectedLocalFile.size / (1024 * 1024))} MiB). يبقى على جهازك.` : image.id === "reactos-experimental" ? "للاختبار فقط: اختر ReactOS الرسمي محلياً. لا يُرفع أو يُحفظ أو يدخل إلى Git." : "اختر ملفاً تملك حق استخدامه. لا يُرفع أو يُحفظ أو يدخل إلى Git."}</small>
            </label>
          ` : ""}
          <div class="terms-note"><b>حدود صريحة:</b> FreeDOS هنا اختبار للمحرك فقط. ReactOS مفتوح المصدر لكنه Alpha. Windows 10 غير مدعوم أو مرفق حالياً.</div>
        </aside>

        <section class="workspace">
          <div class="workspace-head">
            <div>
              <p class="eyebrow">LOCAL SESSION / ${snapshot.id.slice(-8).toUpperCase()}</p>
              <h2>${image.label}</h2>
            </div>
            <div class="state-chip state-${snapshot.state}"><span></span>${stateLabels[snapshot.state]}</div>
          </div>

          <div class="stage-frame">
            <div id="screen-mount" class="screen-mount ${isRunning ? "is-running" : ""}">
              ${isRunning ? "" : `<div class="stage-idle"><span class="terminal-cursor">_</span><b>${bootable ? "المحرك في انتظار الإطلاق" : "لا توجد صورة إقلاع موثقة لهذه البيئة"}</b><p>${bootable ? "اضغط ابدأ التشغيل لتهيئة المعالج الافتراضي داخل متصفحك." : "اختيارك محفوظ، لكننا لن نقلع أصلاً غير مختبر."}</p></div>`}
            </div>
            <div class="stage-grid" aria-hidden="true"></div>
          </div>

          <div class="session-console" aria-live="polite">
            <span>ENGINE STATUS</span>
            <p>${snapshot.message}</p>
          </div>
          <div class="input-console"><span>INPUT MODE</span><p>${inputDetail}</p></div>

          <div class="workspace-actions">
            <label class="memory-field">ذاكرة المحرك <select id="memory-select" ${isRunning ? "disabled" : ""}>${availableMemory.map((option) => `<option value="${option.miB}" ${option.miB === selectedMemoryMiB ? "selected" : ""}>${option.label}</option>`).join("")}</select><small>${availableMemory.find((option) => option.miB === selectedMemoryMiB)?.note ?? "الذاكرة تحجز محلياً داخل المتصفح."}</small></label>
            <label class="memory-field">هدف دقة العرض <select id="display-select" ${isRunning ? "disabled" : ""}>${DISPLAY_PRESETS.map((preset) => `<option value="${preset.id}" ${preset.id === selectedDisplay.id ? "selected" : ""}>${preset.label}</option>`).join("")}</select><small>يضبط سطح العرض؛ وضع VGA الحقيقي يختاره نظام الضيف.</small></label>
            <label class="key-field">مفتاح Windows (اختياري)
              <input id="windows-key" type="password" inputmode="text" autocomplete="off" spellcheck="false" maxlength="29" value="${escapeAttribute(localWindowsKey)}" placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" ${isRunning ? "disabled" : ""}>
              <small>يبقى في ذاكرة هذه الصفحة فقط؛ لا يُرسل أو يُحفظ ولا يغيّر تجربة المحرك الحالية.</small>
            </label>
            <div class="action-group">
              <button class="button secondary" id="stop-session" type="button" ${isRunning ? "" : "disabled"}>إنهاء وتنظيف</button>
              <button class="button primary" id="launch-session" type="button" ${bootable && !isRunning ? "" : "disabled"}>ابدأ التشغيل <span aria-hidden="true">↙</span></button>
            </div>
          </div>
        </section>
      </section>

      <section class="evidence-strip">
        <article><span>01</span><p>لا تستخدم هذه النسخة شبكة للضيف؛ الإقلاع المعروض يبقى بيئة محلية مقيدة.</p></article>
        <article><span>02</span><p>اختبار ReactOS محلي عند 256 MiB وصل إلى SeaBIOS وFreeLoader فقط؛ لا يوجد ادعاء بإقلاع سطح المكتب.</p></article>
        <article><span>03</span><p>تصل الذاكرة إلى 4 GiB لكل المتصفحات؛ يطلب JustGo السعة محلياً من المتصفح للجلسة الحالية.</p></article>
      </section>
    </main>
  `;

  bindEvents();
}

function announce(next: SessionState, message: string, imageId?: string): void {
  session.transition(next, message, imageId);
  render();
}

/** Keep the mounted v86 screen intact after boot; replacing app.innerHTML would destroy it. */
function announceRunning(message: string): void {
  session.transition("running", message);
  const stateChip = document.querySelector<HTMLElement>(".state-chip");
  if (stateChip) {
    stateChip.className = "state-chip state-running";
    stateChip.innerHTML = `<span></span>${stateLabels.running}`;
  }
  const status = document.querySelector<HTMLElement>(".session-console p");
  if (status) status.textContent = message;
  const inputStatus = document.querySelector<HTMLElement>(".input-console p");
  if (inputStatus) inputStatus.textContent = runtime.inputProfile?.detail ?? "انقر داخل الشاشة لإرسال الإدخال.";
}

async function launch(): Promise<void> {
  const image = selectedLaunchImage();
  const selectedDisplay = displayPreset(selectedDisplayId);
  const mount = document.querySelector<HTMLElement>("#screen-mount");
  if (!mount) return;

  try {
    if (selectedLocalFile && inferLocalMediaFormat(selectedLocalFile.name) === "cdrom" && selectedLocalFormat !== "cdrom") {
      throw new Error("صورة ISO يجب أن تُربط كقرص مدمج / CD-ROM.");
    }
    announce("validating", "يتحقق JustGo من مصدر البيئة وحدودها المحلية.", image.id);
    announce("loading-runtime", "يحمّل محرك x86 WebAssembly داخل هذه العلامة.");
    announce("preparing-storage", "يجهّز مساحة الذاكرة والأصل القابل للتحميل عند الطلب.");
    announce("booting", image.source === "user-provided" ? "يقرأ JustGo الملف محلياً داخل الذاكرة ثم يحاول الإقلاع. لا يُرفع الملف." : "يقلع FreeDOS داخل متصفحك. قد يستغرق التحضير الأول وقتاً قصيراً.");
    const memoryOption = memoryOptions(detectMemoryEnvironment()).find((option) => option.miB === selectedMemoryMiB);
    if (!memoryOption) throw new Error("خيار الذاكرة المحدد غير معروف.");
    void memoryLaunchMessage(memoryOption);
    const liveMount = document.querySelector<HTMLElement>("#screen-mount");
    if (!liveMount) throw new Error("تعذر تهيئة شاشة المحرك.");
    await runtime.boot(
      {
        image,
        viewport: { width: selectedDisplay.width, height: selectedDisplay.height, memoryMiB: selectedMemoryMiB },
        persistState: false,
      },
      liveMount,
    );
    announceRunning(`المحرك المحلي جاهز. ${runtime.inputProfile?.detail ?? "انقر داخل الشاشة لإرسال الإدخال."}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "حدث خطأ غير معروف أثناء تهيئة المحرك.";
    announce("failed", message);
  }
}

async function stop(): Promise<void> {
  try {
    announce("stopping", "ينهي JustGo المحرك المحلي ويحرر الذاكرة.");
    await runtime.stop();
    session.transition("stopped", "انتهت الجلسة المحلية. يمكنك تشغيل بيئة جديدة.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تنظيف الجلسة المحلية.";
    session.transition("failed", message);
  }
  localWindowsKey = "";
  render();
}

function bindEvents(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-image-id]").forEach((button) => {
    button.addEventListener("click", () => {
      if (session.snapshot.state === "running" || session.snapshot.state === "booting") return;
      selectedImageId = button.dataset.imageId ?? selectedImageId;
      selectedLocalFormat = selectedImage().format;
      selectedLocalFile = undefined;
      session.reset("تم اختيار بيئة جديدة؛ لم تُحمّل أي صورة بعد.");
      render();
    });
  });
  document.querySelector<HTMLButtonElement>("#launch-session")?.addEventListener("click", () => void launch());
  document.querySelector<HTMLButtonElement>("#stop-session")?.addEventListener("click", () => void stop());
  document.querySelector<HTMLInputElement>("#windows-key")?.addEventListener("input", (event) => {
    localWindowsKey = (event.currentTarget as HTMLInputElement).value;
  });
  document.querySelector<HTMLSelectElement>("#memory-select")?.addEventListener("change", (event) => {
    selectedMemoryMiB = Number((event.currentTarget as HTMLSelectElement).value) as GuestMemoryMiB;
    render();
  });
  document.querySelector<HTMLSelectElement>("#display-select")?.addEventListener("change", (event) => {
    selectedDisplayId = (event.currentTarget as HTMLSelectElement).value as DisplayPresetId;
    render();
  });
  document.querySelector<HTMLInputElement>("#local-media")?.addEventListener("change", (event) => {
    selectedLocalFile = (event.currentTarget as HTMLInputElement).files?.[0];
    if (selectedLocalFile) selectedLocalFormat = inferLocalMediaFormat(selectedLocalFile.name);
    session.reset(selectedLocalFile ? `${localMediaFormatMessage(selectedLocalFile.name, selectedLocalFormat)} لا يغادر جهازك قبل أو بعد الإقلاع.` : "لم يُختَر ملف محلي.");
    render();
  });
  document.querySelector<HTMLSelectElement>("#local-format")?.addEventListener("change", (event) => {
    const requested = (event.currentTarget as HTMLSelectElement).value === "cdrom" ? "cdrom" : "hard-disk";
    selectedLocalFormat = selectedLocalFile && inferLocalMediaFormat(selectedLocalFile.name) === "cdrom" ? "cdrom" : requested;
    session.reset("تم تعديل نوع الوسيط المحلي؛ لم يُقرأ الملف بعد.");
    render();
  });
}

render();
