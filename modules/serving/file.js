const path = require('path');
const fs = require('fs');

module.exports = class File {
    constructor(filepath, stat, isSrc) {
        this.path = filepath;
        this.name = path.basename(filepath);
        this.extension = path.extname(this.name);
        this.stat = stat ? stat : fs.statSync(filepath);
        this.bsrc = isSrc;
    }
}