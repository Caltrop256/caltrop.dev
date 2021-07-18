module.exports = class File {
    constructor(name, stat, isSrc) {
        this.name = name;
        this.stat = stat;
        this.bsrc = Boolean(isSrc);
    }
}