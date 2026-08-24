export interface V86Config {
  [key: string]: unknown;
}

export class V86 {
  constructor(config: V86Config);
  add_listener(event: string, callback: (payload: any) => void): void;
  stop(): Promise<void>;
  destroy(): Promise<void>;
  save_state(): Promise<ArrayBuffer>;
}
