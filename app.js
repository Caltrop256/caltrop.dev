const Server = require('./modules/server.js');
global.log = require('./modules/log').module(Symbol('Unknown'), 'bgred');
log(log.info, 'Start-Up!');

global.server = new Server(require('./config.json').port, __dirname);

global.execute = code => {
    try {
        return eval(code);
    } catch(e) {
        return e;
    }
};

let input = '';
const stdin = process.openStdin();
stdin.addListener('data', s => {
    input += s
    if (s.toString().endsWith('\n')) {
        console.log(global.execute(input));
        input = '';
    }
});

process.on('uncaughtException', err => {
    log(log.error, 'Critical Unhandled Exception!: ', err);
    setTimeout(() => process.exit(1), 150);
});
process.on('unhandledRejection', err => {
    log(log.error, 'Unhandled Promise Rejection!: ', err);
});