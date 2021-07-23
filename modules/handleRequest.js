const path = require('path');
const mime = require('mime-types');
const Folder = require('./serving/folder');
const utils = require('./utils.js');
const NodeURL = require('url');
const QueryString = require('querystring');
const fs = require('fs/promises');
const http = require('http');
const {createReadStream} = require('fs');

const log = require('./log.js').module(Symbol('Request Handler'), 'magenta');

const allowedMethods = ['HEAD', 'GET', 'POST', 'OPTIONS'];

module.exports = function(req, res) {
    const headers = {
        ['Connection']: 'keep-alive',
        ['Keep-Alive']: 'timeout=5',
        ['Server']: 'Swag-Box 9001',
        ['Accept-Ranges']: 'bytes',
        ['Access-Control-Allow-Origin']: '*',
        ['Access-Control-Allow-Methods']: allowedMethods.join(', '),
        ['Access-Control-Allow-Headers']: '*',
        ['Access-Control-Max-Age']: '86400'
    };

    const resp = code => {
        headers['Accept-Ranges'] = 'none';
        const errWhileDisplaying = err => {
            log(log.error, 'An Error occured while displaying the Error Page!: ', err);
            res.writeHead(500, {['Content-Type']: 'text/plain; charset=utf-8'});
            res.end('An Error occured while displaying the Error Page!\nThis is pretty bad .·´¯`(>▂<)´¯`·.');
        };
        try {
            const id = path.resolve(this.root, 'meta', 'error.emb');
            this.embeddedJS.exec(id, req, {code}).then(({data: html}) => {
                headers['Content-Length'] = Buffer.byteLength(html);
                headers['Content-Type'] = 'text/html';
                res.writeHead(code, headers);
                res.end(html);
            }).catch(errWhileDisplaying);
        } catch(err) {
            errWhileDisplaying(err);
        }
    };

    const respNoBody = code => {
        if(code == 204) {
            delete headers['Content-Length'];
            delete headers['Content-Type'];
            res.writeHead(code, headers);
            res.end();
        } else {
            const body = `${code} - ${http.STATUS_CODES[code]}\r\nIf you are viewing this in the browser please contact sarah@caltrop.dev\r\n`;
            headers['Content-Length'] = Buffer.byteLength(body);
            headers['Content-Type'] = 'text/plain; charset=utf-8';
            res.writeHead(code, headers);
            res.end(body);
        }
    }

    try {
        const doNotTrack = typeof req.headers['dnt'] != 'undefined' && req.headers['dnt'] == '1';
        const url = NodeURL.parse(req.url);
        const query = url.query;
        const ip = doNotTrack ? 'DNT' : utils.extractIP(req);

        headers['Tk'] = doNotTrack ? 'N' : 'P';

        let isHead = false;
        switch(req.method.toUpperCase()) {
            case 'HEAD' :
                isHead = true;
            case 'GET' :
                const processAndSendData = async file => {

                    const verifyRange = (range, filesize) => {
                        log(range);
                        headers['Content-Range'] = `bytes */${filesize}`
                        if(!range || typeof range != 'string') return 400;
                        const match = range.substring('bytes='.length).match(/([0-9]+)?-([0-9]+)?/);
                        if(!match || (!match[1] && !match[2])) return 400;
                        let [, start, end] = match.map(Number);
                        const sIsNaN = start != start;
                        const eIsNaN = end != end;
                        if(sIsNaN) start = filesize - end
                        if(sIsNaN || eIsNaN) end = filesize - 1;
                        if(start >= filesize || end >= filesize || start > end) return 416;
                        headers['Content-Range'] = `bytes ${start}-${end}/${filesize}`;
                        headers['Content-Length'] = (end - start) + 1;
                        return {start, end};
                    };

                    try {
                        if(file.extension == '.emb') {
                            if(!this.embeddedJS.has(file.path)) {
                                const scriptData = (await this.fileCache.get(file.path)).toString('utf8');
                                if(!this.embeddedJS.register(file.path, scriptData)) return resp(500);
                            }
                            const _id = (this.embeddedJS.scriptCache.get(file.path).headers.analytics == 'true') && this.analytics.addEntry(req, domain.name, ip);
    
                            this.embeddedJS.run(file.path, req, {analyticsID: _id || 'DNT'}).then(content => {
                                headers['Content-Type'] = content.encoding;
                                if(req.headers.range) {
                                    const rangeInfo = verifyRange(req.headers.range, Buffer.byteLength(content.data));
                                    if(typeof rangeInfo == 'number') return respNoBody(rangeInfo);
                                    content.data = content.data.slice(rangeInfo.start, rangeInfo.end + 1);
                                } else headers['Content-Length'] = Buffer.byteLength(content.data);
                                
                                res.writeHead(req.headers.range ? 206 : 200, headers);
                                if(!isHead) res.write(content.data);
                                res.end();
                            }).catch(() => resp(500));
                        } else {
                            headers['Content-Type'] = mime.lookup(file.extension) || 'application/octet-stream';
                            if(file.stat.size > this.fileCache.fileSizeLimit || req.headers.range) {
                                if(req.headers.range) {
                                    const rangeInfo = verifyRange(req.headers.range, file.stat.size);
                                    if(typeof rangeInfo == 'number') return respNoBody(rangeInfo);
                                    const stream = createReadStream(file.path, rangeInfo);
                                    res.writeHead(206, headers);
                                    stream.pipe(res);
                                } else {
                                    headers['Content-Length'] = file.stat.size;
                                    res.writeHead(200, headers);
                                    createReadStream(file.path).pipe(res);
                                }
                            } else {
                                this.fileCache.get(file.path).then(buffer => {
                                    switch(file.extension) {    
                                        case '.html' :
                                            const _id = this.analytics.addEntry(req, domain.name, ip);
                                            buffer = buffer.replace('data-id="{{DATAID}}"', 'data-id="'+(_id)+'"');
                                        default :
                                            headers['Content-Length'] = Buffer.byteLength(buffer);
                                            res.writeHead(200, headers);
                                            if(!isHead) res.write(buffer);
                                            res.end();
                                            break;
                                    }
                                }).catch(err => {
                                    if(err.code == 'ENOENT') resp(404);
                                    else {
                                        log(log.error, 'Error while trying to read requested file! ', err);
                                        resp(500);
                                    }
                                });
                            }
                        }
                    } catch(err) {
                        log(log.error, err);
                        resp(500);
                    }
                };

                if(url.pathname.startsWith('/meta')) {
                    const file = this.metaFiles.get(url.pathname);
                    if(!file) return resp(403);
                    return processAndSendData(file);
                };

                const requestedDomain = req.headers.host.split(':')[0];
                const domain = this.domains.has(requestedDomain) ? this.domains.get(requestedDomain) : this.domains.get(this.$defaultDomain);
                const dest = path.normalize(path.resolve(domain.location, '.' + url.pathname));
                const dirs = dest.split(path.sep).splice(this.sepSkip);
                const decoded = dirs.map(decodeURIComponent);
                
                const info = domain.access.getDeep(Array.from(decoded));

                if(!info) return resp(404);
                if(info.redirectTo) {
                    if(!info.redirectTo.endsWith('/')) info.redirectTo += '/';
                    url.pathname = info.redirectTo + dirs.splice(info.ind + 1).join('/');
                    headers['Location'] = NodeURL.format(url);
                    return respNoBody(307);
                } else if(info.redirect) {
                    const reDir = dirs;
                    reDir[info.ind] = info.redirect;
                    url.pathname = '/' + reDir.join('/')
                    headers['Location'] = NodeURL.format(url);
                    return respNoBody(307);
                } else if(info.bRootDefault && !url.pathname.endsWith('/')) {
                    url.pathname += '/'
                    headers['Location'] = NodeURL.format(url);
                    return respNoBody(307);
                } else if(info.uncertain) {
                    return this.embeddedJS.exec(path.resolve(this.root, 'meta', 'related.emb'), req, {matches: info.matches, fullPath: dirs, failedAt: info.failedAt}).then(({data: html}) => {
                        headers['Content-Type'] = 'text/html';
                        headers['Content-Length'] = Buffer.byteLength(html);
                        headers['Accept-Ranges'] = 'none';
                        res.writeHead(300, headers);
                        if(!isHead) res.write(html);
                        res.end();
                    }).catch(() => resp(500));
                };

                processAndSendData(info.file);
                break;
            
            case 'POST' :
                if(url.pathname.startsWith('/api/event/')) {
                    const recData = [];
                    req.on('data', chunk => recData.push(chunk));
                    req.on('end', () => {
                        const buf = Buffer.concat(recData);
                        const data = JSON.parse(buf.toString('utf8'));
                        if(typeof data.id == 'string') {
                            const entry = this.analytics.entries.get(data.id);
                            if(!entry) return resp(403);
                            if(!entry.registerEvent(data)) return resp(400);
                            if(entry.$finished) this.analytics.freeEntry(entry.id);
                        } else return resp(403);
                        headers['Content-Type'] = 'text/plain';
                        res.writeHead(204, headers);
                        res.end();
                    });
                } else {
                    // console.log(req);
                    // req.on('data', chunk => console.log(chunk.toString('utf8')));
                    return resp(404);
                }
                break;
                
            case 'OPTIONS' :
                headers['Allow'] = allowedMethods.join(', ');
                return respNoBody(204);
            default :
                headers['Allow'] = allowedMethods.join(', ');
                return resp(405);
        }
    } catch(e) {
        log(log.error, e);
        resp(500);
    }
}