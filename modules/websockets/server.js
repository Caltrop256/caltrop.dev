const WebSocket = require('ws');
const crypto = require('crypto');

const log = require('../log.js').module(Symbol('WebSocket'), 'green');

const messageFactory = (opcode, eventName, payload) => JSON.stringify({
    op: opcode, 
    ev: eventName,
    d: payload, 
    t: Date.now()
});

module.exports = class WebSocketServer {
    constructor(server) {
        this.httpServer = server;
        this.pingDuration = 10000;
        this.acceptableDelay = 5000;

        this.handlers = new Map();

        this.wss = new WebSocket.Server({server});
        this.wss.on('listening', () => log(log.info, 'Websocket Server online!'));
        this.wss.on('connection', socket => {
            socket.lastHeartbeat = Date.now();
            socket.id = crypto.randomBytes(16).toString('base64');


            socket.on('close', () => {
                if(socket.responsibleHandler) socket.responsibleHandler.drop(socket);
            });
            socket.on('message', data => {
                try {
                    this._handleSocketMessage(socket, JSON.parse(data));
                } catch(e) {
                    log(e);
                    log(log.warn, 'Socket "', socket.id, '" caused parsing error!');
                    this._terminateSocket(socket);
                }
            });
            socket.send(messageFactory('handshake', null, {heartbeat: this.pingDuration}));
        });

        this.pingInterval = setInterval(() => this._checkPing(), this.pingDuration);
    }

    destruct() {
        clearInterval(this.pingInterval);
        this.wss.close();
    }

    _terminateSocket(socket) {
        socket.terminate();
    }

    _handleSocketMessage(socket, data) {
        switch(data.op) {
            case 'ack' : 
                if(!this.handlers.has(data.e)) return this._terminateSocket(socket);
                const handler = this.handlers.get(data.e);
                socket.responsibleHandler = handler;
                handler.register(socket, data.d);
                break;
            case 'ping' :
                if(!socket.responsibleHandler) return this._terminateSocket(socket);
                socket.lastHeartbeat = Date.now();
                break;
            case 'send' :
                if(!socket.responsibleHandler) return this._terminateSocket(socket);
                if(socket.responsibleHandler.blacklistedEndpoints.includes(data.e)) return this._terminateSocket(socket);
                if(typeof socket.responsibleHandler[data.e] != 'function') return this._terminateSocket(socket);
                const response = socket.responsibleHandler[data.e](socket, data.d);
                socket.send(messageFactory('response', data.e + data.t, response));
                break;
            default : this._terminateSocket(socket);
        }
    }

    _checkPing() {
        this.wss.clients.forEach(socket => {
            const now = Date.now();
            if(now - socket.lastHeartbeat > this.pingDuration * 2 + this.acceptableDelay) {
                return this._terminateSocket(socket);
            }
        });
    }

    registerHandler(name, handler) {
        this.handlers.set(name, handler);
    }
}