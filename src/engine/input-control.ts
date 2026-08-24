/**
 * JustGo input policy: Pointer Lock is an enhancement, never a requirement.
 * iOS Safari gets Pointer Events and direct touch behaviour instead.
 */
export type InputMode = "pointer-lock" | "pointer-events" | "touch-direct";

export interface InputProfile {
  mode: InputMode;
  label: string;
  detail: string;
}

export interface InputCapabilities {
  pointerEvents: boolean;
  pointerLock: boolean;
}

export function resolveInputProfile(capabilities: InputCapabilities): InputProfile {
  if (capabilities.pointerLock) {
    return { mode: "pointer-lock", label: "ماوس مقفل عند الطلب", detail: "انقر داخل الشاشة لطلب التقاط المؤشر عندما يدعمه المتصفح." };
  }
  if (capabilities.pointerEvents) {
    return { mode: "pointer-events", label: "ماوس/لمس مباشر", detail: "يعتمد على Pointer Events ويعرض مؤشراً افتراضياً داخل الشاشة عند الماوس؛ هذا هو المسار الآمن لأجهزة iOS." };
  }
  return { mode: "touch-direct", label: "لمس مباشر", detail: "لا يدعم المتصفح Pointer Events؛ تستعمل الجلسة لمساً مباشراً فقط." };
}

export function detectInputProfile(target: HTMLElement): InputProfile {
  return resolveInputProfile({
    pointerEvents: "PointerEvent" in window,
    pointerLock: typeof target.requestPointerLock === "function" && "pointerLockElement" in document,
  });
}

export function configureInputSurface(target: HTMLElement): InputProfile {
  const profile = detectInputProfile(target);
  target.dataset.inputMode = profile.mode;
  target.style.touchAction = "none";

  if (profile.mode === "pointer-lock") {
    target.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      void target.requestPointerLock?.();
    });
  }
  installVirtualCursor(target);
  return profile;
}

/** Visual feedback only; v86 continues to own the actual guest mouse transport. */
function installVirtualCursor(target: HTMLElement): void {
  const cursor = document.createElement("span");
  cursor.className = "guest-virtual-cursor";
  cursor.setAttribute("aria-hidden", "true");
  target.append(cursor);

  const hide = () => {
    cursor.hidden = true;
    target.classList.remove("guest-pointer-active");
  };
  target.addEventListener("pointerleave", hide);
  target.addEventListener("pointercancel", hide);
  target.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") {
      hide();
      return;
    }
    const bounds = target.getBoundingClientRect();
    const x = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
    const y = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
    cursor.hidden = false;
    cursor.style.transform = `translate(${x}px, ${y}px)`;
    target.classList.add("guest-pointer-active");
  });
}
