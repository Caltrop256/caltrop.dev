const fs = require('fs');
const path = require('path');
const log = require('../log.js').module(Symbol('FileDB'), 'green');

module.exports = class FileDB {
    constructor(root) {
        this.root = root;
        if(!fs.existsSync(this.root)) {
            log('"store" Folder doesn\'t exist, constructing...');
            fs.mkdirSync(this.root);
        }
    }

    hasIn(dir, file) {
        return Boolean(fs.existsSync(path.resolve(this.root, dir, file)));
    }

    writeTo(dir, file, buffer) {
        const dirPath = path.resolve(this.root, dir);
        if(!fs.existsSync(dirPath)) fs.mkdirSync(dirPath);
        fs.writeFile(path.resolve(dirPath, file), buffer, (err, res) => {
            if(err) return log(log.error, 'Error while writing file!: ', err);
        })
    }

    readFrom(dir, file) {
        return server.fileCache.get(path.resolve(this.root, dir, file));
    }
}