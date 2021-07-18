const utils = require('../utils');
const globals = require('./globals.js');
const fs = require('fs/promises');

const log = require('../log.js').module(Symbol('EmbeddedJS'), 'red');

module.exports = class EmbeddedJavascriptManager {
    scriptCache = new Map();

    clearCache() {
        this.scriptCache.clear();
        log(log.info, 'Embedded JS Cache cleared by ', log.stack[1]);
    }

    has(identifier) {
        return this.scriptCache.has(identifier);
    }

    async exec(path, req, inp) {
        if(!this.has(path) && !this.register(path, await fs.readFile(path, {encoding: 'utf8'}))) throw new Error('Failed to add script to registry!');
        return this.run(path, req, inp);
    }

    register(identifier, script) {
        const headers = {};
        if(script.startsWith('<?HEAD')) {
            const headMatch = script.match(/^<\?HEAD([\s\S]*?)\?>/);
            script = script.substring(headMatch[0].length).trim();
            if(!headMatch[1] || !headMatch[1].trim()) log(log.warn, 'Empty Header Tag at "', identifier, '"!');
            else headMatch[1].trim().split(/[\n\r]+/).map(s => {
                s = s.trim();
                const splitInd = s.indexOf(' ');
                if(splitInd == -1) headers[s] = 'true';
                else headers[s.slice(0, splitInd)] = s.slice(splitInd + 1);
            });
        }
        const regex = /<\?em([\S\s]+?)\?>/g;
        const matches = [];
        let code = 'with($){';
        let match;
        while(match = regex.exec(script)) {
            code += match[1] + ';$.tag.currentId+=1;';
            matches.push({index: match.index, length: match[0].length});
        }
        code += '};'; 

        try {
            const func = new (Object.getPrototypeOf(async function(){}).constructor)('$', code);
            this.scriptCache.set(identifier, {func, matches, data: script, headers});
            return true;
        } catch(err) {
            log(log.error, 'Failed to compile embedded script "', identifier, '"!: ', err);
            return false;
        }
    }

    run(identifier, req, inp) {
        return new Promise((resolve, reject) => {
            if(!this.scriptCache.has(identifier)) return reject(null);
            const script = this.scriptCache.get(identifier);
            if(script.headers.cache == 'true' && typeof script.headers.__cachedData != 'undefined') return resolve(script.headers.__cachedData);
            const {func, matches} = script;

            const $ = utils.deepAssign(function echo() {
                for(let i = 0; i < arguments.length; ++i) {
                    if($.echoOut[$.tag.currentId]) $.echoOut[$.tag.currentId] += String(arguments[i]);
                    else $.echoOut[$.tag.currentId] = String(arguments[i]);
                }
            }, utils.deepAssign({inp}, globals));
            $.req = req;

            func($).then(() => {
                let {data} = script;
                let offset = 0;
                for(let i = 0; i < matches.length; ++i) {
                    const echoOutput = $.echoOut[i] || '';
                    const {index, length} = matches[i];
                    data = data.substring(0, index + offset) + echoOutput + data.substring(index + offset + length);
                    offset += echoOutput.length - length;
                };

                const out = {data, encoding: script.headers['Content-Type'] || 'text/html'}

                if(script.headers.cache == 'true') {
                    script.headers.__cachedData = out;
                    delete script.func;
                    delete script.matches;
                    delete script.data;
                }
                resolve(out);

            }).catch(err => {
                log(log.error, 'Runtime Error for embedded script "', identifier, '"!: ', err);
                reject(err);
            })
        });
    }
}