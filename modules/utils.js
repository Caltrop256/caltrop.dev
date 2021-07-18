const isActiveClone = Symbol('infinite recursion preventer 9001');
const leven = require('leven');

const log = require('./log.js').module(Symbol('Utils'), 'bgmagenta');

const rankMatch = (inp, target) => {
    if(inp.length > target.length) return 0;
    const str = String(inp);
    if(str == target) return 7;
    const low = str.toLowerCase();
    const targetLow = target.toLowerCase();
    if(low == targetLow) return 6;
    const maxLen = Math.max(inp.length, target.length);
    const dist = (maxLen - leven(low, targetLow)) / maxLen;
    if(targetLow.startsWith(low)) return 5 + dist;
    if(targetLow.includes(' ' + low)) return 4 + dist;
    if(targetLow.includes(low)) return 3 + dist;
    if(target.replace(/([A-Z])/g, '_$1').split(/[_\- ]/g).map(s => s.charAt(0).toLowerCase()).join("").includes(low)) return 2 + dist;
    return dist;
}

Object.prototype.toString = function() {
    try {
        return JSON.stringify(this);
    } catch(e) {
        return '[object Object]';
    }
}

Array.prototype.last = function() {
    return this.length && this[this.length - 1];
}

Map.prototype.map = function(callback) {
    const arr = Array(this.size);
    let i = 0;
    for(const [key, value] of this) arr[i++] = callback(value, key);
    return arr;
}
Map.prototype.first = function() {
    for(const kv of this) return kv;
}
Map.prototype.matchFind = function*(target) {
    if(!this.size) return;
    const keys = this.keys();
    for(const key of keys) yield {name: key, score: rankMatch(target, key)};
}
Map.prototype.matchFindSorted = function(target) {
    if(!this.size) return [];
    return [...this.matchFind(target)].sort((a,b) => b.score - a.score);
}

Buffer.prototype.replace = function(target, source) {
    const i = this.indexOf(target);
    if(i == -1) return this;
    const before = this.slice(0, i);
    const after = this.slice(i + target.length).replace(target, source);
    return Buffer.concat([before, Buffer.from(source), after], i + source.length + after.length);
}

module.exports = {
    isInt32(n) {
        return (n | 0) == n;
    },

    isObject(obj) {
        return !(obj == null || typeof obj != 'object');
    },

    clone(source) {
        if(!this.isObject(source) || source.hasOwnProperty(isActiveClone)) return source;    
        const temp = source.constructor();
        for(const key in source) {
            if(source.hasOwnProperty(key)) {
                source[isActiveClone] = null;
                temp[key] = this.clone(source[key]);
                delete source[isActiveClone];
            }
        }
        return temp;
    },

    deepAssign(target, source) {
        if(!this.isObject(source) || source.hasOwnProperty(isActiveClone)) return source;
        //if(!this.isObject(target)) target = source.constructor();

        for(const key in source) {
            if(source.hasOwnProperty(key)) {
                source[isActiveClone] = null;
                if(target.hasOwnProperty(key)) {
                    if(this.isObject(target[key])) {
                        target[key] = this.deepAssign(target[key], source[key]);
                    }
                } else target[key] = this.clone(source[key]);
                delete source[isActiveClone];
            }
        }
        return target;
    },

    reaquire(path) {
        try {
            delete require.cache[require.resolve(path)];
            return require(path);
        } catch(err) {
            log(log.error, 'Error while reqauiring "', path, '"!: ', err);
            return null;
        }
    },

    isIPv4(str) {
        return /^(?:(?:\d|[1-9]\d|1\d{2}|2[0-4]\d|25[0-5])\.){3}(?:\d|[1-9]\d|1\d{2}|2[0-4]\d|25[0-5])$/.test(str);
    },

    isIPv6(str) {
        return /^((?=.*::)(?!.*::.+::)(::)?([\dA-F]{1,4}:(:|\b)|){5}|([\dA-F]{1,4}:){6})((([\dA-F]{1,4}((?!\3)::|:\b|$))|(?!\2\3)){2}|(((2[0-4]|1\d|[1-9])?\d|25[0-5])\.?\b){4})$/i.test(str);
    },

    extractIP(req) {
        const isValid = s => this.isIPv4(s) || this.isIPv6(s);
        const headers = ['x-client-ip', 'cf-connecting-ip', 'fastly-client-ip', 'true-client-ip', 'x-real-ip', 'x-cluster-client-ip', 'x-forwarded', 'forwarded-for', 'forwarded'];
        for(let i = 0; i < headers.length; ++i) {
            if(isValid(req.headers[headers[i]])) return req.headers[headers[i]];
        }
        const forwarded = req.headers['x-forwarded-for'] && req.headers['x-forwarded-for'].split(',').map(e => {
            const ip = e.trim();
            if(ip.includes(':')) {
                const split = ip.split(':');
                if(split.length == 2) return split[0];
            } else return ip;
        }).find(isValid);
        if(forwarded) return forwarded;

        if(req.connection) {
            if(isValid(req.connection.remoteAddress)) return req.connection.remoteAddress;
            if(req.connection.socket && isValid(req.connection.socket.remoteAddress)) return req.connection.socket.remoteAddress;
        }
        if(req.socket && isValid(req.socket.remoteAddress)) return req.socket.remoteAddress;
        if(req.info && isValid(req.info.remoteAddress)) return req.info.remoteAddress;
        if(req.requestContext && req.requestContext.identity && isValid(req.requestContext.identity.sourceIp)) return req.requestContext.identity.sourceIp;
        return null;
    },

    isURL(string) {
        try {
            return new URL(string);
        } catch(err) {
            return !(err.code == 'ERR_INVALID_URL');
        }
    },

    checkObjectValidity(check, target) {
        if(!this.isObject(check)) return null;
        const res = {};
        for(const key in check) {
            if(typeof target[key] == 'undefined') return null;
            const desiredType = target[key];
            switch(typeof check[key]) {
                case 'string' :
                case 'number' :
                case 'boolean' :
                    if(typeof check[key] != desiredType) return null;
                    break;
                case 'object' :
                    if(!this.isObject(check[key]) || desiredType != 'object') return null;
                    break;
                default : return null;
            }
            res[key] = check[key];
        }
        return res;
    },

    rankMatch
}