const util = require('util');
const crypto = require('crypto');

const config = require('../../config.json');
const messageFactory = (opcode, eventName, payload) => JSON.stringify({
    op: opcode, 
    ev: eventName,
    d: payload, 
    t: Date.now()
});

class Handler {
    sockets = new Map();
    blacklistedEndpoints = ['register', 'drop'];

    register(socket) {
        socket.sendMessage = function(event, payload) {
            this.send(messageFactory('event', event, payload))
        };
        this.sockets.set(socket.id, socket);
    }
    drop(socket) {
        this.sockets.delete(socket.id);
    }
}

module.exports = [
    class REPL extends Handler {
        register(socket, password) {
            const sha256Buffer = s => crypto.createHash('sha256').update(s).digest();
            if(!crypto.timingSafeEqual(sha256Buffer(password), sha256Buffer(config.REPL.password))) socket.terminate();
        }
        eval(socket, code) {
            return util.inspect(global.execute(code), true, Infinity, false);
        }
    },

    class Chat extends Handler {
        constructor() {
            super();
            this.blacklistedEndpoints.push('_sendAll');
        }
        _sendAll(user, content) {
            this.sockets.forEach(s => {
                s.sendMessage('message', {user, content});
            });
        }
        register(socket, handshakeData) {
            super.register(socket);
            if(typeof handshakeData == 'object' && handshakeData != null && typeof handshakeData.username == 'string') {
                const name = handshakeData.username.trim().substring(0, 16).trim().replace(/[^A-zÀ-ÖØ-öø-įĴ-őŔ-žǍ-ǰǴ-ǵǸ-țȞ-ȟȤ-ȳɃɆ-ɏḀ-ẞƀ-ƓƗ-ƚƝ-ơƤ-ƥƫ-ưƲ-ƶẠ-ỿ0-9-_ ]/g, '?');
                if(!name) socket.terminate();
                else {
                    this.sockets.get(socket.id).username = name;
                    this._sendAll('<system>', `"${socket.username}" has joined the chat!`)
                };
            } else socket.terminate();
        }
        drop(socket) {
            super.drop(socket);
            this._sendAll('<system>', `"${socket.username}" has left the chat!`);
        }

        createMessage(socket, data) {
            if(typeof data == 'object' && data != null && typeof data.content == 'string') {
            const content = data.content.substring(0, 57).replace(/\s+/g, ' ').trim();
                this._sendAll(socket.username, content);
            } else socket.terminate();
        }

        who() {
            const arr = [];
            this.sockets.forEach(s => {
                if(s.username) arr.push(s.username);
            });
            return arr;
        }
    }
]