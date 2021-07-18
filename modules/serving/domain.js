const path = require('path');
const fs = require('fs');
const Folder = require('./folder');

module.exports = class Domain {
    constructor(name, root) {
        this.name = name;
        this.location = path.resolve(root, 'domains', name);
        fs.rmdirSync(path.resolve(this.location, 'build'), {recursive: true});
        this.access = new Folder(path.resolve(this.location, 'src'));
    }
}