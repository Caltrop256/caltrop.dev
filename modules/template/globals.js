const path = require('path');

module.exports = {
    echoOut: [],
    tag: {
        currentId: 0
    },
    responseCode: 200,

    escape(unsafe) {
        return unsafe.replace(/[&<>"']/g, t => {switch(t) {
            case '&' : return '&amp;';
            case '<' : return '&lt;';
            case '>' : return '&gt;';
            case '"' : return '&quot;';
            case "'" : return '&#039;';
        }});
    },

    metadata(opts) {
        const o = {
            og: Object.assign({
                title: 'Untitled',
                type: 'website',
                image: null,
                url: null,
                description: 'Description Missing',
                site_name: 'Caltrop'
            }, opts.og),
            color: opts.color || '#FE019A'
        };
        o.twitter = {title: o.og.title, description: o.og.description, image: o.og.image};

        const meta = (key, value, accessorKey = 'property', accessorValue = 'content') => `<meta ${accessorKey}="${this.escape(key)}" ${accessorValue}="${this.escape(value)}" />`;

        let str = `<title>${this.escape(o.og.title)}</title>` + meta('theme-color', o.color, 'name') 
            + meta('robots', 'index, follow', 'name') + '<meta charset="UTF-8" />'
            + meta('twitter:creator', '@Caltrop256', 'name') + meta('twitter:card', 'summary_large_image', 'name');
        for(const k in o.og) {
            if(o.og[k]) str += meta('og:' + k, o.og[k]);
            if(o.twitter[k]) str += meta('twitter:' + k, o.twitter[k]);
        }
        return str;
    },

    async loadFile(filepath) {
        return (await server.fileCache.get(path.resolve(server.root, filepath))).toString('utf8');
    },

    getBody(req) {
        return new Promise((resolve, reject) => {
            const recData = [];
            req.on('data', chunk => recData.push(chunk));
            req.on('end', () => {
                resolve(Buffer.concat(recData));
            });
            req.on('error', reject);
        });
    },

    require() {
        return require(...arguments);
    }
}