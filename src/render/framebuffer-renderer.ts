export type FramebufferBackend = "webgpu" | "canvas2d" | "unavailable";

export interface FramebufferDescriptor {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

export interface RendererCapability {
  readonly preferred: FramebufferBackend;
  readonly webgpuAvailable: boolean;
}

type WebGpuCanvasContext = {
  configure(configuration: Record<string, unknown>): void;
  getCurrentTexture(): { createView(): unknown };
};

type WebGpuLike = {
  requestAdapter(): Promise<{ requestDevice(): Promise<any> } | null>;
  getPreferredCanvasFormat(): string;
};

function webGpuApi(): WebGpuLike | undefined {
  return (navigator as unknown as { gpu?: WebGpuLike }).gpu;
}

export function detectFramebufferCapability(hasCanvas = typeof HTMLCanvasElement !== "undefined", hasWebGpu = Boolean(webGpuApi())): RendererCapability {
  return { preferred: hasWebGpu ? "webgpu" : hasCanvas ? "canvas2d" : "unavailable", webgpuAvailable: hasWebGpu };
}

export function validateFramebuffer(frame: FramebufferDescriptor): void {
  if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width <= 0 || frame.height <= 0) throw new Error("أبعاد framebuffer غير صالحة.");
  if (frame.rgba.length !== frame.width * frame.height * 4) throw new Error("حجم RGBA لا يطابق أبعاد framebuffer.");
}

export interface FramebufferRenderer {
  readonly backend: FramebufferBackend;
  present(frame: FramebufferDescriptor): Promise<void>;
  destroy(): void;
}

export class Canvas2dFramebufferRenderer implements FramebufferRenderer {
  readonly backend = "canvas2d" as const;
  private readonly context: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("لم يتوفر Canvas 2D لعرض framebuffer.");
    this.context = context;
  }

  async present(frame: FramebufferDescriptor): Promise<void> {
    validateFramebuffer(frame);
    if (this.canvas.width !== frame.width || this.canvas.height !== frame.height) {
      this.canvas.width = frame.width;
      this.canvas.height = frame.height;
    }
    this.context.putImageData(new ImageData(new Uint8ClampedArray(frame.rgba), frame.width, frame.height), 0, 0);
  }

  destroy(): void { this.context.clearRect(0, 0, this.canvas.width, this.canvas.height); }
}

/**
 * WebGPU displays the same RGBA frame through an upload canvas and a texture.
 * CPU emulation remains outside this class; GPU submission is presentation-only.
 */
export class WebGpuFramebufferRenderer implements FramebufferRenderer {
  readonly backend = "webgpu" as const;
  private readonly uploadCanvas = document.createElement("canvas");
  private readonly uploadContext = this.uploadCanvas.getContext("2d", { alpha: false });
  private readonly gpuContext: WebGpuCanvasContext;
  private readonly device: any;
  private readonly format: string;
  private pipeline: any;
  private sampler: any;
  private texture: any;
  private textureSize = "";

  private constructor(private readonly canvas: HTMLCanvasElement, device: any, format: string) {
    this.device = device;
    this.format = format;
    const context = canvas.getContext("webgpu") as unknown as WebGpuCanvasContext | null;
    if (!context || !this.uploadContext) throw new Error("تعذر تهيئة WebGPU أو سطح الرفع.");
    this.gpuContext = context;
    this.gpuContext.configure({ device, format, alphaMode: "opaque" });
    this.sampler = device.createSampler({ magFilter: "nearest", minFilter: "nearest" });
    this.pipeline = this.createPipeline();
  }

  static async create(canvas: HTMLCanvasElement): Promise<WebGpuFramebufferRenderer> {
    const gpu = webGpuApi();
    if (!gpu) throw new Error("WebGPU غير متاح في هذا المتصفح.");
    const adapter = await gpu.requestAdapter();
    if (!adapter) throw new Error("تعذر الحصول على GPU adapter.");
    return new WebGpuFramebufferRenderer(canvas, await adapter.requestDevice(), gpu.getPreferredCanvasFormat());
  }

  async present(frame: FramebufferDescriptor): Promise<void> {
    validateFramebuffer(frame);
    const key = `${frame.width}x${frame.height}`;
    if (this.textureSize !== key) this.allocate(frame.width, frame.height);
    this.uploadContext!.putImageData(new ImageData(new Uint8ClampedArray(frame.rgba), frame.width, frame.height), 0, 0);
    this.device.queue.copyExternalImageToTexture({ source: this.uploadCanvas }, { texture: this.texture }, { width: frame.width, height: frame.height });
    const bindGroup = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: this.sampler }, { binding: 1, resource: this.texture.createView() }] });
    const encoder = this.device.createCommandEncoder({ label: "JustGo framebuffer present" });
    encoder.pushDebugGroup("JustGo framebuffer render");
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.gpuContext.getCurrentTexture().createView(), loadOp: "clear", clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
    pass.setPipeline(this.pipeline); pass.setBindGroup(0, bindGroup); pass.draw(3); pass.end();
    encoder.popDebugGroup();
    this.device.queue.submit([encoder.finish()]);
  }

  destroy(): void { this.texture?.destroy?.(); }

  private allocate(width: number, height: number): void {
    this.texture?.destroy?.();
    this.uploadCanvas.width = width; this.uploadCanvas.height = height;
    this.canvas.width = width; this.canvas.height = height;
    this.texture = this.device.createTexture({ label: "JustGo framebuffer texture", size: [width, height], format: "rgba8unorm", usage: 0x04 | 0x02 }); // TEXTURE_BINDING | COPY_DST
    this.textureSize = `${width}x${height}`;
  }

  private createPipeline(): any {
    const shader = this.device.createShaderModule({ label: "JustGo framebuffer shader", code: `
      @group(0) @binding(0) var nearestSampler: sampler;
      @group(0) @binding(1) var guestFrame: texture_2d<f32>;
      struct Out { @builtin(position) position: vec4f, @location(0) uv: vec2f }
      @vertex fn vs(@builtin(vertex_index) vertexIndex: u32) -> Out {
        var positions = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(3.0, 1.0), vec2f(-1.0, 1.0));
        var uvs = array<vec2f, 3>(vec2f(0.0, 2.0), vec2f(2.0, 0.0), vec2f(0.0, 0.0));
        return Out(vec4f(positions[vertexIndex], 0.0, 1.0), uvs[vertexIndex]);
      }
      @fragment fn fs(input: Out) -> @location(0) vec4f { return textureSample(guestFrame, nearestSampler, input.uv); }
    ` });
    return this.device.createRenderPipeline({ label: "JustGo framebuffer pipeline", layout: "auto", vertex: { module: shader, entryPoint: "vs" }, fragment: { module: shader, entryPoint: "fs", targets: [{ format: this.format }] }, primitive: { topology: "triangle-list" } });
  }
}

export async function createFramebufferRenderer(canvas: HTMLCanvasElement): Promise<FramebufferRenderer> {
  if (detectFramebufferCapability().webgpuAvailable) {
    try { return await WebGpuFramebufferRenderer.create(canvas); } catch { /* Canvas fallback preserves local rendering. */ }
  }
  return new Canvas2dFramebufferRenderer(canvas);
}
