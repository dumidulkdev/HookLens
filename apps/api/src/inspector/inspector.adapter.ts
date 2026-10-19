import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, ServerOptions } from 'socket.io';

export class InspectorAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origin: string,
  ) {
    super(app, { maxConcurrentMessages: 1 });
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const securedOptions: Partial<ServerOptions> = {
      ...options,
      cors: { origin: this.origin },
      maxHttpBufferSize: 4096,
      allowRequest: (request, callback) => {
        callback(null, !request.headers.origin || request.headers.origin === this.origin);
      },
    };
    // Nest's adapter types require full options; Socket.IO supplies the omitted defaults.
    return super.createIOServer(port, securedOptions as ServerOptions);
  }
}
