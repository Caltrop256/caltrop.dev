const fs = require('fs/promises');
const cfs = require('fs');
const path = require('path');
const utils = require('../utils');
const File = require('./file.js');
const {parse, HTMLElement} = require('node-html-parser');

const infFileName = '_info.json';
const defaultSettings = {
    default: ['index.html', 'index.emb'],
    defaultUnavailable: false,

    build: {
        compileJavascript: true,
        includeTracker: true
    },

    redirect: {
        destination: null
    },
    
    rewrite: {
        destinaton: null
    }
}

const log = require('../log.js').module(Symbol('Folder'), 'green');

module.exports = class Folder {
    static toBuildDir(srcDirString) {
        return srcDirString.replace(/src/, 'build');
    }
    constructor(location) {
        this.path = location;
        this.ready = false;
        this.files = new Map();
        this.sub = new Map();

        const accessSync = path => new Promise(r => cfs.access(path, cfs.constants.R_OK, err => r(!err)));

        this.$readyPromise = accessSync(path.resolve(this.path, infFileName)) // read config file if exists and apply default settings
        .then(b => {
            if(b) return server.fileCache.get(path.resolve(this.path, infFileName));
            else return Promise.resolve('{}');
        }).then(json => this.settings = utils.deepAssign(JSON.parse(json.toString('utf8')), defaultSettings))

        // read directory for files & create build compile directories w/ files
        .then(() => fs.mkdir(Folder.toBuildDir(this.path)))
        .then(() => fs.readdir(this.path))
        .then(items => Promise.all(items.map(n => fs.stat(path.resolve(this.path, n)))).then(stats => [stats, items]))
        .then(([stats, items]) => {
            const folderPromises = [];
            const compilePromises = [];
            for(let i = 0; i < items.length; ++i) {
                if(items[i] == infFileName) continue;
                if(stats[i]) {
                    const filepath = path.resolve(this.path, items[i]);
                    if(stats[i].isDirectory()) {
                        const folder = new Folder(filepath);
                        folderPromises.push(folder.$readyPromise);
                        this.sub.set(items[i], folder);
                    } else if(stats[i].isFile()) {
                        switch(path.extname(items[i])) {
                            case '.js' : if(this.settings.build.compileJavascript) break;
                            case '.html' :
                                if(this.settings.build.compileJavascript) {
                                    compilePromises.push(this.compileHtml(items[i]));
                                    break;
                                }
                            default :
                                this.files.set(items[i], new File(filepath, stats[i], true));
                                break;
                        }
                    }
                }
            }
            return Promise.all([Promise.all(folderPromises), Promise.all(compilePromises)]);
        }).then(([, compilePromises]) => {
            const compiledFiles = compilePromises.flat();
            for(let i = 0; i < compiledFiles.length; ++i) {
                this.files.set(compiledFiles[i].name, compiledFiles[i]);
            }

            this.settings.defaultUnavailable = !this.getDefault(); 
        })

        this.$readyPromise.then(() => this.ready = true);
    }

    getDefault() {
        if(typeof this.settings.default == 'string') return this.files.has(this.settings.default) ? this.files.get(this.settings.default) : null;
        for(let i = 0; i < this.settings.default.length; ++i) {
            if(this.files.has(this.settings.default[i])) return this.files.get(this.settings.default[i]);
        }
        return null;
    }

    getDeep(filepath, ind = 0) {
        if(this.settings.redirect.destination) {
            return {redirectTo: this.settings.redirect.destination, ind};
        }
        if(!this.sub.size && !this.files.size) return null;
        if(typeof filepath == 'string') filepath = filepath.split(path.sep);
        const target = filepath.shift();

        // get default file
        if(!target) {
            const defaultFile = this.getDefault();
            if(defaultFile) return {
                folder: this,
                file: defaultFile,
                bRootDefault: true
            }; else {
                log(log.warn, 'Default File missing at: "', this.path, '"!');
                return null; // specified default file doesn't exist
            }
        }

        // recursively check directory & files
        if(this.sub.has(target)) return this.sub.get(target).getDeep(filepath, ind + 1);
        else if(!filepath.length && this.files.has(target)) return {
            folder: this,
            file: this.files.get(target),
            bRootDefault: false
        }; else {
            const checkForFile = !filepath.length;
            const matches = [];
            const dirs = this.sub.matchFind(target);
            const relevanceThreshold = 3.5;
            for(const match of dirs) {
                if(match.score >= 6) return {redirect: match.name, ind};
                if(match.score >= relevanceThreshold) matches.push(match);
            }
            if(checkForFile) {
                const files = this.files.matchFind(target);
                for(const match of files) {
                    if(match.score >= 6) return {redirect: match.name, ind};
                    if(match.score >= relevanceThreshold) matches.push(match);
                }
            }
            if(matches.length) return {uncertain: true, matches, failedAt: ind};
            return null;
        }
    }

    compileHtml(file) {
        return new Promise((resolve, reject) => {
            server.fileCache.get(path.resolve(this.path, file))
            .then(buffer => {
                const root = parse(buffer.toString('utf8'));
                const scriptTags = root.querySelectorAll('script').filter(s => !s.getAttribute('src') || !utils.isURL(s.getAttribute('src')));
                const buildFolderPath = Folder.toBuildDir(this.path);

                const accessSync = path => new Promise(r => cfs.access(path, cfs.constants.R_OK, err => r(!err)));
                const attr = [];
                
                Promise.all(scriptTags.map((s, i) => {
                    attr[i] = s.getAttribute('src');
                    if(!attr[i]) return Promise.resolve(s.childNodes[0].rawText);
                    return accessSync(path.resolve(this.path, attr[i]));
                }))
                .then(data => {
                    const arr = [];
                    for(let i = 0; i < data.length; ++i) {
                        if(typeof data[i] == 'string') arr.push(Promise.resolve(data[i]));
                        else if(data[i] == false) log(log.warn, 'JS source file "', path.resolve(this.path, attr[i]), '" does not exist!');
                        else arr.push(server.fileCache.get(path.resolve(this.path, attr[i])));
                    }
                    return Promise.all(arr);
                })
                .then(buffers => {
                    const sources = buffers.map(b => b.toString('utf8'));
                    const srcname = this.path.split(path.sep).last() + '.min.js';
                    const stream = cfs.createWriteStream(path.resolve(buildFolderPath, srcname), {encoding: 'utf8'});
                    const analyticsInsertionIndex = (Math.random() * sources.length) | 0;
                    for(let i = 0; i < sources.length; ++i) {
                        if(i == analyticsInsertionIndex) stream.write(server.analytics.appendingScript);
                        if(!sources[i].endsWith(';')) sources[i] += ';';
                        stream.write(sources[i]);
                    };
                    if(sources.length == 0) stream.write(server.analytics.appendingScript);
                    stream.end();
                    (root.querySelector('body') || root).appendChild(new HTMLElement('script', {src: './' + srcname, ['data-id']: '{{DATAID}}'}, `src="./${srcname}" data-id="{{DATAID}}" defer`));

                    for(let i = 0; i < scriptTags.length; ++i) {
                        scriptTags[i].parentNode.removeChild(scriptTags[i]);
                    }
                    root.removeWhitespace();
                    const filepath = path.resolve(buildFolderPath, file)
                    fs.writeFile(filepath, root.toString(), {encoding: 'utf8'}).then(() => {
                        const res = [new File(filepath, null, false)];
                        res[1] = new File(path.resolve(buildFolderPath, srcname), null, false);
                        resolve(res);
                    });
                })
            }).catch(reject);
        });
    }
}