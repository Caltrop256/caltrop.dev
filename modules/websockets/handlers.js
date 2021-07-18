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
        register(socket, handshakeData) {
            super.register(socket);
            this.sockets.get(socket.id).username = handshakeData.username;
        }
        createMessage(socket, data) {
            if(typeof data == 'object' && typeof data.content == 'string') {
                this.sockets.forEach(s => {
                    if(s.id != socket.id) s.sendMessage('message', {user: socket.username, content: data.content});
                });
            }
        }
    }
]