const path = require('path');
const mime = require('mime-types');
const Folder = require('./serving/folder');
const utils = require('./utils.js');
const NodeURL = require('url');
const QueryString = require('querystring');
const fs = require('fs/promises');
const {createReadStream} = require('fs');

const log = require('./log.js').module(Symbol('Request Handler'), 'magenta');

module.exports = function(req, res) {
    const headers = {
        ['Connection']: 'keep-alive',
        ['Keep-Alive']: 'timeout=5',
        ['Server']: 'Swag-Box 9001',
        ['Accept-Ranges']: 'bytes'
    };

    const resp = (code) => {
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

    try {
        const url = NodeURL.parse(req.url);
        const query = url.query;
        const ip = utils.extractIP(req);
        const doNotTrack = typeof req.headers['dnt'] != 'undefined' && req.headers['dnt'] == '1';

        headers['Tk'] = doNotTrack ? 'N' : 'P';

        let isHead = false;
        switch(req.method.toUpperCase()) {
            case 'HEAD' :
                isHead = true;
            case 'GET' :
                const processAndSendData = async (file) => {
                    try {
                        const {path: filepath, extension: extname} = file;
                        if(extname == '.emb') {

                            if(!this.embeddedJS.has(filepath)) {
                                const scriptData = (await this.fileCache.get(filepath)).toString('utf8');
                                if(!this.embeddedJS.register(filepath, scriptData)) return resp(500);
                            }
                            const _id = (this.embeddedJS.scriptCache.get(filepath).headers.analytics == 'true' && !doNotTrack) && this.analytics.addEntry(req, domain.name, ip);
    
                            this.embeddedJS.run(filepath, req, {analyticsID: _id || 'DNT'}).then(content => {
                                headers['Content-Type'] = content.encoding;
                                headers['Content-Length'] = Buffer.byteLength(content.data);
                                res.writeHead(200, headers);
                                if(!isHead) res.write(content.data);
                                res.end();
                            }).catch(() => resp(500));
                        } else {
                            headers['Content-Type'] = mime.lookup(extname) || 'application/octet-stream';
                            if(file.stat.size > this.fileCache.fileSizeLimit || req.headers.range) {
                                if(req.headers.range) {
                                    const match = req.headers.range.match(/^bytes=([0-9]+)-([0-9]+)?/);
                                    if(!match || match.length < 2) return resp(400);
                                    const start = Number(match[1]);
                                    if(!isFinite(start) || start >= file.stat.size) return resp(416);
                                    const end = (match[2] | 0) || file.stat.size - 1;
                                    if(end >= file.stat.size) return resp(416);
                                    if(end <= start) return resp(416);
                                    const stream = createReadStream(file.path, {start, end});
                                    headers['Content-Range'] = `bytes ${start}-${end}/${file.stat.size}`;
                                    headers['Content-Length'] = (end - start) + 1;
                                    res.writeHead(206, headers);
                                    stream.pipe(res);
                                } else {
                                    headers['Content-Length'] = file.stat.size;
                                    res.writeHead(200, headers);
                                    createReadStream(file.path).pipe(res);
                                }
                            } else {
                                this.fileCache.get(filepath).then(buffer => {
                                    switch(extname) {    
                                        case '.html' :
                                            const _id = !doNotTrack && this.analytics.addEntry(req, domain.name, ip);
                                            buffer = buffer.replace('data-id="{{DATAID}}"', 'data-id="'+(doNotTrack ? 'DNT' : _id)+'"');
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
                    return resp(307);
                } else if(info.redirect) {
                    const reDir = dirs;
                    reDir[info.ind] = info.redirect;
                    url.pathname = '/' + reDir.join('/')
                    headers['Location'] = NodeURL.format(url);
                    return resp(307);
                } else if(info.bRootDefault && !url.pathname.endsWith('/')) {
                    url.pathname += '/'
                    headers['Location'] = NodeURL.format(url);
                    return resp(307);
                } else if(info.uncertain) {
                    return this.embeddedJS.exec(path.resolve(this.root, 'meta', 'related.emb'), req, {matches: info.matches, fullPath: dirs, failedAt: info.failedAt}).then(({data: html}) => {
                        headers['Content-Type'] = 'text/html';
                        headers['Content-Length'] = Buffer.byteLength(html);
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
                        res.writeHead(200, headers);
                        res.end();
                    });
                } else {
                    return resp(404);
                }
                break;
            default :
                headers['Allow'] = 'HEAD, GET, POST';
                return resp(405);
        }
    } catch(e) {
        log(log.error, e);
        resp(500);
    }
}