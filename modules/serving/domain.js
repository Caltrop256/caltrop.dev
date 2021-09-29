const path = require('path');
const fs = require('fs');
const Folder = require('./folder');
const utils = require('../utils.js');

module.exports = class Domain {
    constructor(name, root) {
        this.name = name;
        this.location = path.resolve(root, 'domains', name);
        this.info = utils.reaquire(path.resolve(this.location, 'info.json'));
        if(fs.existsSync(path.resolve(this.location, 'build'))) fs.rmSync(path.resolve(this.location, 'build'), {recursive: true});
        this.access = new Folder(path.resolve(this.location, 'src'));
    }
}