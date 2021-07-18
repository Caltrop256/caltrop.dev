const {inspect} = require('util');
const fs = require('fs');

function log(...args) {
    if(!args.length) return;
    log.$color(log.colors.yellow); log.$write('[' + log.$timestamp() + ']');

    let prefixLength = 0;

    if(typeof args[0] == 'symbol') {
        const printPrefix = prefix => {log.$color(log.colors.reset); log.$color(prefix[0]); log.$write(prefix[1]); log.$color(log.colors.reset)};
        if(log.modules[args[0]]) {
            log.$color(log.colors.reset); log.$color(log.modules[args[0]]);
            log.$write('[' + args[0].description + ']');
            if(typeof args[1] == 'symbol' && log.$prefixes[args[1]]) {
                printPrefix(log.$prefixes[args[1]]);
                prefixLength = 2;
            } else {
                printPrefix(log.$prefixes[log.info]);
                prefixLength = 1;
            }
        } else if(log.$prefixes[args[0]]) {
            printPrefix(log.$prefixes[args[0]]);
            prefixLength = 1;
        }
    }
    
    log.$write(' ');
    log.$logItems(prefixLength ? args.splice(prefixLength) : args);
    log.$color(log.colors.reset); log.$write('\n');
};

log.modules = Object.create(null);
log.module = (name, color = reset) => {
    if(!log.colors[color]) log.module(Symbol('LOG'), 'yellow')(log.warn, 'Tried to register invalid logging color: ', name, ' => ', color);
    log.modules[name] = log.colors[color];
    const func = Object.assign(((type, ...items) => log.call(null, name, type, ...items)), log);
    Object.defineProperty(func, 'stack', {
        get: () => log.stack
    });
    return func;
}
log.colors = {reset: '\x1b[0m'};
['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'].forEach((c, i) => {
    log.colors[c] = '\x1b[' + (30 + i) + 'm';
    log.colors['bg' + c] = '\x1b[' + (40 + i) + 'm';
});

log.info = Symbol('log info');
log.warn = Symbol('log warn');
log.error = Symbol('log error');

log.$stream = null;
log.$updateStreamHandle = path => {
    if(log.$stream) log.$stream.end('\n[' + log.$timestamp() + '] END OF LOG! Moved to: "' + path + '"!');
    log.$stream = fs.createWriteStream(path, {encoding: 'utf8', flags: 'a'});
}
log.$timestamp = (d = new Date()) => d.toUTCString().substring(5, 25);
log.$filenameByDate = (d = new Date()) => d.toISOString().split('T')[0] + '.txt';
log.$write = str => {log.$stream.write(str); process.stdout.write(str)};
log.$color = clr => process.stdout.write(clr);
log.$logItems = a => {
    for(let i = 0; i < a.length; ++i) {
        switch (typeof a[i]) {
            case 'string' : log.$color(log.colors.cyan); log.$write(a[i]); break;
            case 'number' : log.$color(log.colors.green); log.$write(String(a[i])); break;
            default : log.$color(log.colors.reset); log.$stream.write(inspect(a[i], true, 2, false)); process.stdout.write(inspect(a[i], true, 2, true)); break;
        }
    }
}
log.$prefixes = {
    [log.info]: ['\x1b[34m', '[INFO]'],
    [log.warn]: ['\x1b[31m', '[WARN]'],
    [log.error]: ['\x1b[47m\x1b[31m', '[ERROR]']
};

Object.defineProperty(log, 'stack', {
    get: () => new Error().stack.substring('Error\n'.length).split('\n').splice(2).map(s => s.substring(7))
});


log.$updateStreamHandle('./logs/' + log.$filenameByDate());

module.exports = log;