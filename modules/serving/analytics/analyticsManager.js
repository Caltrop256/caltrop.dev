const crypto = require('crypto');
const fs = require('fs');
const utils = require('../../utils.js');

module.exports = class AnalyticsManager {
    static Entry = class AnalyticsEntry {
        $finished = false;
        constructor(id, ip, domain, req) {
            this.startTimestamp = Date.now();
            this.id = id;
            this.ip = ip;
            this.domain = domain;
            this.location = req.url || null;
            this.userAgent = String(req.headers['user-agent']).substring(0, 256) || null;
            this.referer = req.headers.referrer || req.headers.referer || null;
            this.method = req.method;
            this.sessionLength = null;

            this.events = [];
        }

        registerEvent(event) {
            const valid = utils.checkObjectValidity(event, {
                n: 'string',
                t: 'number',
                d: 'object',
                id: 'string',
                f: 'object'
            });
            if(!valid) return false;
            if(!['pageview', 'link', 'pageexit'].includes(valid.n)) return false;
            if(!utils.checkObjectValidity(valid.f, {
                tF: 'number',
                tT: 'number'
            })) return false;

            switch(valid.n) {
                case 'pageview' :
                    if(!utils.checkObjectValidity(valid.d, {
                        width: 'number',
                        headless: 'boolean'
                    })) return false;
                    break;
                case 'link' :
                    if(!utils.checkObjectValidity(valid.d, {
                        outbound: 'boolean',
                        target: 'string',
                        newTab: 'boolean'
                    })) return false;
                    break;
                case 'pageexit' :
                    if(!utils.checkObjectValidity(valid.d, {})) return false;
                    this.sessionLength = valid.f.tF;
                    this.$finished = true;
                    break;
                default : return false;
            }

            this.events.push(valid);
            return true;
        }
    }
    constructor() {
        this.appendingScript = fs.readFileSync('./modules/serving/analytics/events.js', {encoding: 'utf8'});
        this.entries = new Map();
    }

    addEntry(req, domain, ip) {
        const id = crypto.randomBytes(32).toString('base64');
        this.entries.set(id, new AnalyticsManager.Entry(id, ip, domain, req));
        return id;
    }

    freeEntry(id) {
        const entry = this.entries.get(id);
        if(!id) return null;
        this.entries.delete(id);
        const sql = server.sql('meta');
        sql('INSERT INTO `analytics` (`id`, `timestamp`, `ip`, `domain`, `location`, `userAgent`, `referer`, `method`, `sessionLength`) VALUES (?,?,?,?,?,?,?,?,?)', [
            entry.id,
            new Date(entry.startTimestamp),
            entry.ip,
            entry.domain,
            entry.location,
            entry.userAgent,
            entry.referer,
            entry.method,
            entry.sessionLength
        ]);
        for(let i = 0; i < entry.events.length; ++i) {
            const event = entry.events[i];
            switch(event.n) {
                case 'pageview' :
                    sql('INSERT INTO `analytics.event.pageview` (`id`, `timestamp`, `width`, `headless`) VALUES (?,?,?,?);', [
                        event.id,
                        new Date(event.t),
                        event.d.width,
                        event.d.headless
                    ]);
                    break;
                case 'link' : 
                    sql('INSERT INTO `analytics.event.link` (`id`, `timestamp`, `outbound`, `target`, `newTab`) VALUES (?,?,?,?,?);', [
                        event.id,
                        new Date(event.t),
                        event.d.outbound,
                        event.d.target,
                        event.d.newTab
                    ]);
                    break;
                case 'pageexit' :
                    sql('INSERT INTO `analytics.event.pageexit` (`id`, `timestamp`) VALUES (?,?);', [
                        event.id,
                        new Date(event.t)
                    ]);
                    break;
            }
        }
    }
}