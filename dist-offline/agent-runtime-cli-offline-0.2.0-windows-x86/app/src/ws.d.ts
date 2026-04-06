declare module 'ws' {
  export type RawData = string | Buffer | ArrayBuffer | Buffer[]
  export class WebSocket {
    static readonly OPEN: number
    readonly OPEN: number
    readyState: number
    send(data: string): void
    close(): void
    on(event: 'message', listener: (data: RawData) => void): this
    on(event: 'close', listener: () => void): this
  }

  export class WebSocketServer {
    constructor(options: { noServer?: boolean })
    handleUpgrade(
      request: unknown,
      socket: unknown,
      head: unknown,
      callback: (socket: WebSocket) => void,
    ): void
  }
}
