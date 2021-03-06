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

const allowedMethods = ['HEAD', 'GET', 'POST', 'OPTIONS', 'TRANS'];

function request(req, res) {
    const headers = {
        ['Connection']: 'keep-alive',
        ['Keep-Alive']: 'timeout=5',
        ['Server']: 'Desiring Machine',
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
        const ip = doNotTrack ? 'DNT' : utils.extractIP(req);

        headers['Tk'] = doNotTrack ? 'N' : 'P';

        const requestedDomain = req.headers.host.split(':')[0];
        const domain = this.domains.has(requestedDomain) ? this.domains.get(requestedDomain) : this.domains.get(this.$defaultDomain);
        const dest = path.normalize(path.resolve(domain.location, '.' + url.pathname));
        const dirs = dest.split(path.sep).splice(this.sepSkip);
        const decoded = dirs.map(decodeURIComponent);
        const info = domain.access.getDeep(Array.from(decoded));

        let isHead = false;
        switch(req.method.toUpperCase()) {
            case 'HEAD' :
                isHead = true;
            case 'GET' :
                const processAndSendData = async file => {

                    const verifyRange = (range, filesize) => {
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
                            const _id = (this.embeddedJS.scriptCache.get(file.path).headers.analytics == 'true') && this.analytics.addEntry(req, domain.name, ip, info.fullPath);
    
                            this.embeddedJS.run(file.path, req, {analyticsID: _id || 'DNT'}).then(content => {
                                headers['Content-Type'] = content.encoding;
                                if(req.headers.range) {
                                    const rangeInfo = verifyRange(req.headers.range, Buffer.byteLength(content.data));
                                    if(typeof rangeInfo == 'number') return respNoBody(rangeInfo);
                                    content.data = content.data.slice(rangeInfo.start, rangeInfo.end + 1);
                                } else headers['Content-Length'] = Buffer.byteLength(content.data);
                                
                                res.writeHead(req.headers.range ? 206 : content.code, headers);
                                if(!isHead) res.write(content.data);
                                res.end();
                            }).catch(err => {
                                //log(log.error, err);
                                resp(500)}
                            );
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
                                            const _id = this.analytics.addEntry(req, domain.name, ip, info.fullPath);
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

                if(url.pathname.startsWith('/meta/') || url.pathname.startsWith('/api/')) {
                    const file = this.metaFiles.get(url.pathname);
                    if(!file) return resp(403);
                    return processAndSendData(file);
                };

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
                const postToEmb = async file => {
                    if(!this.embeddedJS.has(file.path)) {
                        const scriptData = (await this.fileCache.get(file.path)).toString('utf8');
                        if(!this.embeddedJS.register(file.path, scriptData)) return resp(500);
                    }

                    this.embeddedJS.run(file.path, req, {}).then(content => {
                        headers['Content-Type'] = content.encoding;
                        const respLen = Buffer.byteLength(content.data);
                        if(req.headers.range) {
                            const rangeInfo = verifyRange(req.headers.range, respLen);
                            if(typeof rangeInfo == 'number') return respNoBody(rangeInfo);
                            content.data = content.data.slice(rangeInfo.start, rangeInfo.end + 1);
                        } else headers['Content-Length'] = respLen;
                        
                        res.writeHead(req.headers.range ? 206 : content.code, headers);
                        if(respLen) res.write(content.data);
                        res.end();
                    }).catch(() => resp(500));
                }
                if(url.pathname.startsWith('/meta/') || url.pathname.startsWith('/api/')) {
                    const file = this.metaFiles.get(url.pathname);
                    if(!file || file.extension != '.emb') return resp(403);
                    postToEmb(file);
                } else {
                    if(!info) return resp(404);
                    postToEmb(info.file);
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

function clientError(err, socket) {
    if(err.code == 'ECONRESET' || !socket.writable) return;
    const {STATUS_CODES} = http;
    const CRLF = '\r\n';

    switch (err.code) {
        case 'HPE_INVALID_METHOD' :
            const targetBuffer = Buffer.from('TRANS');
            const len = Buffer.byteLength(targetBuffer);

            const invalid = () => {
                socket.end(Buffer.from(
                    `HTTP/1.1 405 ${STATUS_CODES[405]}${CRLF}` +
                    `Allow: ${allowedMethods.join(', ')}${CRLF}` +
                    `Connection: close${CRLF}${CRLF}`, 'ascii'
                ));
                socket.destroy();
            }
            if(Buffer.byteLength(err.rawPacket) < len) return invalid();
            for(let i = 0; i < len; ++i) {
                if(err.rawPacket[i] != targetBuffer[i]) return invalid();
            }
            socket.write('HTTP/1.1 200 OK\r\nContent-Type text/plain\r\n\r\n');
            socket.end('[46m\r\n\r\n[45;1m\r\n\r\n[47m\r\n\r\n[45;1m\r\n\r\n[46m\r\n\r\n[0m\r\n');
            break;
        case 'HPE_HEADER_OVERFLOW' :
            socket.end(Buffer.from(
                `HTTP/1.1 431 ${STATUS_CODES[431]}${CRLF}` +
                `Connection: close${CRLF}${CRLF}`, 'ascii'
            ));
            break;
        case 'ERR_HTTP_REQUEST_TIMEOUT' :
            socket.end(Buffer.from(
                `HTTP/1.1 408 ${STATUS_CODES[408]}${CRLF}` +
                `Connection: close${CRLF}${CRLF}`, 'ascii'
            ));
            break;
        default :
            socket.end(Buffer.from(
                `HTTP/1.1 400 ${STATUS_CODES[400]}${CRLF}` +
                `Connection: close${CRLF}${CRLF}`, 'ascii'
            ))
            break;
    }
    socket.destroy();
}

module.exports = {
    request,
    clientError
}