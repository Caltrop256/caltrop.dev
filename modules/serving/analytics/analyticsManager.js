const crypto = require('crypto');
const fs = require('fs');
const utils = require('../../utils.js');

module.exports = class AnalyticsManager {
    static Entry = class AnalyticsEntry {
        $finished = false;
        constructor(id, ip, domain, req) {
            const DNT = ip == 'DNT';
            this.startTimestamp = Date.now();
            this.id = id;
            this.ip = ip;
            this.domain = domain;
            this.location = req.url || null;
            this.userAgent = DNT ? null : String(req.headers['user-agent']).substring(0, 256) || null;
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
        if(ip == 'DNT') {
            this.freeEntry(id);
            return 'DNT';
        } else return id;
    }

    freeEntry(id) {
        const entry = this.entries.get(id);
        if(!entry) return null;
        this.entries.delete(id);
        const sql = server.sql('meta');
        sql.insert('analytics', {
            id: entry.id,
            timestamp: new Date(entry.startTimestamp),
            ip: entry.ip,
            domain: entry.domain,
            location: entry.location,
            userAgent: entry.userAgent,
            referer: entry.referer,
            method: entry.method,
            sessionLength: entry.sessionLength
        });
        if(entry.ip == 'DNT') entry.events.length = 0; // just to make sure
        for(let i = 0; i < entry.events.length; ++i) {
            const event = entry.events[i];
            switch(event.n) {
                case 'pageview' :
                    return sql.insert('analytics.event.pageview', {
                        id: event.id,
                        timestamp: new Date(event.t),
                        width: event.d.width,
                        headless: Boolean(event.d.headless)
                    });
                case 'link' : 
                    return sql.insert('analytics.event.link', {
                        id: event.id,
                        timestamp: new Date(event.t),
                        outbound: event.d.outbound,
                        target: event.d.target,
                        newTab: event.d.newTab
                    })
                case 'pageexit' :
                    return sql.insert('analytics.event.pageexit', {
                        id: event.id,
                        timestamp: new Date(event.t)
                    })
            }
        }
    }

    flush() {
        for(const key of this.entries.keys()) {
            this.freeEntry(key);
        }
    }
}