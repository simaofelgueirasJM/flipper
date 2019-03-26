/**
 * Copyright 2018-present Facebook.
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * @format
 */

import type {SecureServerConfig} from './utils/CertificateProvider';
import type Logger from './fb-stubs/Logger';
import type {ClientQuery} from './Client.js';
import type {Store} from './reducers/index.js';

import CertificateProvider from './utils/CertificateProvider';
import {RSocketServer, ReactiveSocket} from 'rsocket-core';
import RSocketTCPServer from 'rsocket-tcp-server';
import {Single} from 'rsocket-flowable';
import Client from './Client.js';
import {RecurringError} from './utils/errors';

const EventEmitter = (require('events'): any);
const invariant = require('invariant');
const tls = require('tls');
const net = require('net');

export const SECURE_PORT = 8088;
export const INSECURE_PORT = 8089;

type RSocket = {|
  fireAndForget(payload: {data: string}): void,
  connectionStatus(): any,
  close(): void,
|};

type ClientInfo = {|
  connection: ?ReactiveSocket,
  client: Client,
|};

export default class Server extends EventEmitter {
  connections: Map<string, ClientInfo>;
  secureServer: RSocketServer;
  insecureServer: RSocketServer;
  certificateProvider: CertificateProvider;
  connectionTracker: ConnectionTracker;
  logger: Logger;
  store: Store;
  initialisePromise: Promise<void>;

  constructor(logger: Logger, store: Store) {
    super();
    this.logger = logger;
    this.connections = new Map();
    this.certificateProvider = new CertificateProvider(this, logger);
    this.connectionTracker = new ConnectionTracker(logger);
    this.store = store;
  }

  on: ((event: 'new-client', callback: (client: Client) => void) => void) &
    ((event: 'error', callback: (err: Error) => void) => void) &
    ((event: 'clients-change', callback: () => void) => void);

  init() {
    this.initialisePromise = this.certificateProvider
      .loadSecureServerConfig()
      .then(
        options => (this.secureServer = this.startServer(SECURE_PORT, options)),
      )
      .then(() => {
        this.insecureServer = this.startServer(INSECURE_PORT);
        return;
      });
    return this.initialisePromise;
  }

  startServer(port: number, sslConfig?: SecureServerConfig) {
    const server = this;
    const serverFactory = onConnect => {
      const transportServer = sslConfig
        ? tls.createServer(sslConfig, socket => {
            onConnect(socket);
          })
        : net.createServer(onConnect);
      transportServer
        .on('error', err => {
          server.emit('error', err);
          console.error(`Error opening server on port ${port}`, 'server');
        })
        .on('listening', () => {
          console.debug(
            `${
              sslConfig ? 'Secure' : 'Certificate'
            } server started on port ${port}`,
            'server',
          );
          server.emit('listening', port);
        });
      return transportServer;
    };
    const rsServer = new RSocketServer({
      getRequestHandler: sslConfig
        ? this._trustedRequestHandler
        : this._untrustedRequestHandler,
      transport: new RSocketTCPServer({
        port: port,
        serverFactory: serverFactory,
      }),
    });

    rsServer.start();
    return rsServer;
  }

  _trustedRequestHandler = (conn: RSocket, connectRequest: {data: string}) => {
    const server = this;

    const clientData: ClientQuery = JSON.parse(connectRequest.data);
    this.connectionTracker.logConnectionAttempt(clientData);

    const client = this.addConnection(conn, clientData);

    conn.connectionStatus().subscribe({
      onNext(payload) {
        if (payload.kind == 'ERROR' || payload.kind == 'CLOSED') {
          console.debug(`Device disconnected ${client.id}`, 'server');
          server.removeConnection(client.id);
        }
      },
      onSubscribe(subscription) {
        subscription.request(Number.MAX_SAFE_INTEGER);
      },
    });

    return client.responder;
  };

  _untrustedRequestHandler = (
    conn: RSocket,
    connectRequest: {data: string},
  ) => {
    const clientData = JSON.parse(connectRequest.data);
    this.connectionTracker.logConnectionAttempt(clientData);

    if (
      clientData.os === 'iOS' &&
      !clientData.device.toLowerCase().includes('simulator')
    ) {
      this.emit(
        'error',
        new Error(
          "Flipper doesn't currently support physical iOS devices. You can still use it to view logs, but for now to use the majority of the Flipper plugins you'll have to use the Simulator.",
        ),
      );
      console.warn(
        'Physical iOS device detected. This is not currently supported by Flipper.',
        'server',
      );
    }

    return {
      requestResponse: (payload: {data: string}) => {
        if (typeof payload.data !== 'string') {
          return;
        }

        let rawData;
        try {
          rawData = JSON.parse(payload.data);
        } catch (err) {
          console.error(
            `Invalid JSON: ${payload.data}`,
            'clientMessage',
            'server',
          );
          return;
        }

        const json: {|
          method: 'signCertificate',
          csr: string,
          destination: string,
        |} = rawData;
        if (json.method === 'signCertificate') {
          console.debug('CSR received from device', 'server');
          const {csr, destination} = json;
          return new Single(subscriber => {
            subscriber.onSubscribe();
            this.certificateProvider
              .processCertificateSigningRequest(csr, clientData.os, destination)
              .then(result => {
                subscriber.onComplete({
                  data: JSON.stringify({
                    deviceId: result.deviceId,
                  }),
                  metadata: '',
                });
              })
              .catch(e => {
                console.error(e, 'server');
                subscriber.onError(e);
              });
          });
        }
      },

      // Leaving this here for a while for backwards compatibility,
      // but for up to date SDKs it will no longer used.
      // We can delete it after the SDK change has been using requestResponse for a few weeks.
      fireAndForget: (payload: {data: string}) => {
        if (typeof payload.data !== 'string') {
          return;
        }

        let rawData;
        try {
          rawData = JSON.parse(payload.data);
        } catch (err) {
          console.error(`Invalid JSON: ${payload.data}`, 'server');
          return;
        }

        const json: {|
          method: 'signCertificate',
          csr: string,
          destination: string,
        |} = rawData;
        if (json.method === 'signCertificate') {
          console.debug('CSR received from device', 'server');
          const {csr, destination} = json;
          this.certificateProvider
            .processCertificateSigningRequest(csr, clientData.os, destination)
            .catch(e => {
              console.error(e);
            });
        }
      },
    };
  };

  close(): Promise<void> {
    if (this.initialisePromise) {
      return this.initialisePromise.then(_ => {
        this.secureServer.stop();
        this.insecureServer.stop();
      });
    }
    return Promise.resolve();
  }

  toJSON() {
    return null;
  }

  addConnection(conn: ReactiveSocket, query: ClientQuery): Client {
    invariant(query, 'expected query');

    const id = `${query.app}-${query.os}-${query.device}-${query.device_id}`;
    console.debug(`Device connected: ${id}`, 'server');

    const client = new Client(id, query, conn, this.logger, this.store);

    const info = {
      client,
      connection: conn,
    };

    client.init().then(() => {
      console.debug(
        `Device client initialised: ${id}. Supported plugins: ${client.plugins.join(
          ', ',
        )}`,
        'server',
      );

      /* If a device gets disconnected without being cleaned up properly,
       * Flipper won't be aware until it attempts to reconnect.
       * When it does we need to terminate the zombie connection.
      */
      if (this.connections.has(id)) {
        const connectionInfo = this.connections.get(id);
        connectionInfo &&
          connectionInfo.connection &&
          connectionInfo.connection.close();
        this.removeConnection(id);
      }

      this.connections.set(id, info);
      this.emit('new-client', client);
      this.emit('clients-change');
      client.emit('plugins-change');
    });

    return client;
  }

  attachFakeClient(client: Client) {
    this.connections.set(client.id, {
      client,
      connection: null,
    });
  }

  removeConnection(id: string) {
    const info = this.connections.get(id);
    if (info) {
      info.client.emit('close');
      this.connections.delete(id);
      this.emit('clients-change');
      this.emit('removed-client', id);
    }
  }
}

class ConnectionTracker {
  timeWindowMillis = 20 * 1000;
  connectionProblemThreshold = 4;

  // "${device}.${app}" -> [timestamp1, timestamp2...]
  connectionAttempts: Map<string, Array<number>> = new Map();
  logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  logConnectionAttempt(client: ClientQuery) {
    const key = `${client.os}-${client.device}-${client.app}`;
    const time = Date.now();
    var entry = this.connectionAttempts.get(key) || [];
    entry.push(time);
    entry = entry.filter(t => t >= time - this.timeWindowMillis);

    this.connectionAttempts.set(key, entry);
    if (entry.length >= this.connectionProblemThreshold) {
      console.error(
        new RecurringError(
          `Connection loop detected with ${key}. Connected ${
            this.connectionProblemThreshold
          } times within ${this.timeWindowMillis / 1000}s.`,
        ),
        'server',
      );
    }
  }
}
