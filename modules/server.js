const http = require('http');
const path = require('path');
const Domain = require('./serving/domain.js');
const utils = require('./utils.js');
const chokidar = require('chokidar');
const fs = require('fs');
const {CronJob} = require('cron');
const queryFactory = require('./sql.js');
const WebSocketServer = require('./websockets/server.js');
const wsHandlers = require('./websockets/handlers.js');
const File = require('./serving/file');

const log = require('./log.js').module(Symbol('Server'), 'cyan');

const config = require('../config.json');

module.exports = class Server {
    static reconstruct(path, ...args) {
        const resolved = require.resolve(path);
        delete require.cache[resolved];
        return new (require(resolved))(...args);
    }

    constructor(port, location) {
        this.port = port;
        this.root = String(location);
        this.domains = new Map(fs.readdirSync(path.resolve(this.root, 'domains')).map(name => [name, new Domain(name, this.root)]));
        this.$defaultDomain = Array.from(this.domains)[0][0];
        this.sepSkip = this.domains.get(this.$defaultDomain).location.split(path.sep).length;

        this.fileCache = Server.reconstruct('./serving/cacheFileReader.js', 25, 1);
        this.analytics = Server.reconstruct('./serving/analytics/analyticsManager.js');
        this.embeddedJS = Server.reconstruct('./template/embeddedJavascriptManager.js');
        this.sockets = null;
        this.sql = queryFactory(config.mysql);

        this.metaFiles = new Map();
        const _metapaths = {
            ['/meta/favicon.png']: path.resolve(this.root, 'meta/template', 'favicon.png'),
            ['/meta/css/']: path.resolve(this.root, 'meta/template', 'style.css'),
            ['/meta/css/bg/']: path.resolve(this.root, 'meta/template', 'bg.gif'),
            ['/meta/css/bg/trans']: path.resolve(this.root, 'meta/template', 'bg_trans.gif'),
            ['/meta/search/']: path.resolve(this.root, 'meta', 'search.emb'),
            ['/meta/map/']: path.resolve(this.root, 'meta/map.emb'),
            ['/meta/privacy/']: path.resolve(this.root, 'meta/privacy.emb'),
            ['/meta/copyleft/']: path.resolve(this.root, 'meta/copyleft.emb'),
            ['/meta/contact/']: path.resolve(this.root, 'meta/contact.emb'),
            ['/meta/cube.js']: path.resolve(this.root, 'meta/template/cube.js'),
            ['/meta/analytics.js']: path.resolve(this.root, 'modules/serving/analytics/events.js'),
            ['/meta/websocketclient.js']: path.resolve(this.root, 'modules/websockets/client.emb'),
        }
        for(const k in _metapaths) {
            this.metaFiles.set(k, new File(_metapaths[k], null, 'META'));
        }

        this.handleRequest = require('./handleRequest.js');

        this.logUpdateCron = new CronJob('0 0 0 * * *', () => {
            log.$updateStreamHandle(path.resolve(this.root, 'logs', log.$filenameByDate()));
            this.analytics.flush();
        }, null, true, null, null, false, 0);

        Promise.all(this.domains.map(d => d.access.$readyPromise)).then(() => {
            log(log.info, 'All public files loaded!');
            this.httpServer = http.createServer((req, res) => {
                if(this.handleRequest) this.handleRequest.call(this, req, res);
                else {
                    res.writeHead(500, {['Content-Type']: 'text/plain; charset=utf-8'});
                    res.end('head empty no thoughts (・_・ヾ');
                }
            });
            this.sockets = new WebSocketServer(this.httpServer);
            for(let i = 0; i < wsHandlers.length; ++i) {
                this.sockets.registerHandler(wsHandlers[i].prototype.constructor.name.toLowerCase(), new wsHandlers[i]);
            }
            this.httpServer.listen(this.port, '127.0.0.1', () => {
                log(log.info, 'Now online on port: ', this.port, '!');
            });
        }).catch(err => {
            log(log.error, err)
        });

        this.pendingDomainBuilds = [];
        this.rebuilding = false;
        this.domainReloadInterval = setInterval(() => {
            for(let i = 0; i < this.pendingDomainBuilds.length; ++i) {
                this.pendingDomainBuilds[i].time -= 100;
                if(!this.rebuilding && this.pendingDomainBuilds[i].time < 0) {
                    this.embeddedJS.clearCache();
                    const d = new Domain(this.pendingDomainBuilds[i].name, this.root);
                    this.domains.set(this.pendingDomainBuilds[i].name, d);
                    this.rebuilding = true;
                    d.access.$readyPromise.then(() => {
                        this.rebuilding = false;
                        log(log.info, 'Finished rebuilding ', d.name);
                    }).catch((err) => {
                        log(log.error, 'Failed Rebuilding ', d.name, '! : ', err);
                    });
                    this.pendingDomainBuilds.splice(i, 1);
                    return;
                }
            }
        }, 100);

        this.watcher = chokidar.watch(this.root, {
            depth: Infinity,
            awaitWriteFinish: true,
            ignored: ['**/node_modules/**/*', '**/.git/**/*']
        });

        this.watcher.on('ready', () => {
            this.watcher.on('all', (event, filepath, data) => {
                const pathparts = filepath.split(path.sep).splice(this.sepSkip - 2);

                switch(pathparts[0]) {
                    case 'domains' :
                        const domain = pathparts[1];
                        if(pathparts[2] == 'src') {
                            for(let i = 0; i < this.pendingDomainBuilds.length; ++i) {
                                if(this.pendingDomainBuilds[i].name == domain) return this.pendingDomainBuilds[i].time = 3000;
                            }
                            log(log.info, domain, ': pending re-build!');
                            this.pendingDomainBuilds.push({name: domain, time: 3000});
                        };
                        break;
                    case 'modules' :
                        const module = pathparts[1];
                        switch(pathparts[1]) {
                            case 'handleRequest.js' :
                                this.handleRequest = utils.reaquire(filepath);
                                if(this.handleRequest) log(log.info, 'Reloaded ', filepath);
                                break;
                            case 'serving' :
                                if(pathparts[2] != 'analytics') {
                                    delete require.cache[require.resolve(path.resolve(this.root, ...pathparts))];
                                    this.fileCache = Server.reconstruct('./serving/cacheFileReader.js', 25, 1);
                                }
                        }
                        break;
                    case 'meta' :
                        this.embeddedJS.clearCache();
                        this.fileCache.clear();
                        break;
                    default : return;
                }
            });
        });
    }
}