import type {
  FrontendAttachSnapshot,
  FrontendEvent,
  FrontendOperationInvocation,
  FrontendOperationResult,
  FrontendResponse,
  FrontendRuntimeDescriptor,
  RuntimeLeaseSnapshot,
} from './generated.mjs';
import { GeneratedFrontendClient } from './generated-client.mjs';

export * from './generated.mjs';
export { GeneratedFrontendClient } from './generated-client.mjs';
export const FRONTEND_SCHEMA: 'supercode.frontend.contract.v2';
export const FRONTEND_METHODS: Readonly<Record<import('./generated.mjs').FrontendMethodId, import('./generated.mjs').FrontendWireMethod>>;
export const FRONTEND_EVENT_METHOD: 'frontend.v2.event';

export interface FrontendClientOptions {
  baseUrl: string;
  token: string;
  clientId?: string;
  permissions?: Array<'observe' | 'interact' | 'approve' | 'terminate'>;
  fetch?: typeof globalThis.fetch;
}
export interface RequestOptions { signal?: AbortSignal; }

export class FrontendClientError extends Error {
  code: number | null;
  operation: string | null;
  permission: string | null;
  holder: string | null;
  expiresAtMs: number | null;
  extensions: Record<string, unknown>;
}

export class FrontendClient extends GeneratedFrontendClient<RequestOptions> {
  constructor(options: FrontendClientOptions);
  readonly clientId: string;
  readonly lastSequence: number;
  headers(): Record<string, string>;
  rpc(method: import('./generated.mjs').FrontendWireMethod, params?: Record<string, unknown>, options?: RequestOptions): Promise<unknown>;
  describe(options?: RequestOptions): Promise<FrontendRuntimeDescriptor>;
  attach(limit?: number, options?: RequestOptions & {afterSequence?: number}): Promise<FrontendAttachSnapshot>;
  sendInput(prompt: string, options?: RequestOptions): Promise<{accepted:boolean}>;
  submit(prompt: string, options?: RequestOptions): Promise<{reply:string}>;
  interrupt(options?: RequestOptions): Promise<{interrupted:boolean}>;
  steer(prompt: string, options?: RequestOptions): Promise<{queued:boolean}>;
  respond(response: FrontendResponse, options?: RequestOptions): Promise<{accepted:boolean}>;
  invoke(operation: FrontendOperationInvocation, options?: RequestOptions): Promise<FrontendOperationResult>;
  lease(options?: RequestOptions): Promise<RuntimeLeaseSnapshot>;
  takeControl(options?: RequestOptions): Promise<RuntimeLeaseSnapshot>;
  heartbeat(options?: RequestOptions): Promise<RuntimeLeaseSnapshot>;
  startEvents(options?: {afterSequence?:number;signal?:AbortSignal}): Promise<void>;
  stopEvents(): void;
  detach(options?: RequestOptions): Promise<RuntimeLeaseSnapshot>;
  close(options?: RequestOptions): Promise<{closed:boolean}>;
  on(event: 'event', listener: (event: FrontendEvent) => void): this;
  on(event: 'disconnect', listener: () => void): this;
  off(event: 'event', listener: (event: FrontendEvent) => void): this;
  off(event: 'disconnect', listener: () => void): this;
  once(event: 'event', listener: (event: FrontendEvent) => void): this;
  once(event: 'disconnect', listener: () => void): this;
}

export interface FrontendWebSocketLike {
  send(data: string): void;
  close(): void;
  addEventListener(event: 'message', listener: (event: {data:string|ArrayBuffer|ArrayBufferView}) => void): void;
  addEventListener(event: 'close'|'error', listener: () => void): void;
}
export interface FrontendWebSocketConnectOptions {
  url: string;
  token: string;
  clientId?: string;
  permissions?: Array<'observe'|'interact'|'approve'|'terminate'>;
  webSocketFactory(options:{url:string;headers:Record<string,string>}): FrontendWebSocketLike | Promise<FrontendWebSocketLike>;
}
export class FrontendWebSocketClient extends GeneratedFrontendClient<Record<string, never>> {
  constructor(socket:FrontendWebSocketLike);
  static connect(options:FrontendWebSocketConnectOptions):Promise<FrontendWebSocketClient>;
  readonly lastSequence:number;
  rpc(method:import('./generated.mjs').FrontendWireMethod,params?:Record<string,unknown>):Promise<unknown>;
  describe():Promise<FrontendRuntimeDescriptor>;
  attach(limit?:number,options?:{afterSequence?:number}):Promise<FrontendAttachSnapshot>;
  sendInput(prompt:string):Promise<{accepted:boolean}>;
  submit(prompt:string):Promise<{reply:string}>;
  interrupt():Promise<{interrupted:boolean}>;
  steer(prompt:string):Promise<{queued:boolean}>;
  respond(response:FrontendResponse):Promise<{accepted:boolean}>;
  invoke(operation:FrontendOperationInvocation):Promise<FrontendOperationResult>;
  lease():Promise<RuntimeLeaseSnapshot>;
  takeControl():Promise<RuntimeLeaseSnapshot>;
  heartbeat():Promise<RuntimeLeaseSnapshot>;
  detach():Promise<RuntimeLeaseSnapshot>;
  close():Promise<{closed:boolean}>;
  closeTransport():void;
  on(event:'event',listener:(event:FrontendEvent)=>void):this;
  on(event:'disconnect',listener:()=>void):this;
  on(event:'protocolError',listener:(error:Error)=>void):this;
  off(event:'event',listener:(event:FrontendEvent)=>void):this;
  off(event:'disconnect',listener:()=>void):this;
  off(event:'protocolError',listener:(error:Error)=>void):this;
  once(event:'event',listener:(event:FrontendEvent)=>void):this;
  once(event:'disconnect',listener:()=>void):this;
  once(event:'protocolError',listener:(error:Error)=>void):this;
}
