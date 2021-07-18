const fs = require('fs');
const log = require('../log.js').module(Symbol('File Cache'), 'green');

module.exports = class CacheFileReader {
    constructor(maxFiles, maxFileSize) {
        this.maxFiles = maxFiles | 0;
        this.fileSizeLimit = (maxFileSize * 1048576) | 0;
        this.size = 0;
        this.root = null;
    }

    clear() {
        this.root = null;
        this.size = 0;
        log(log.info, 'File Cache cleared by ', log.stack[1]);
    }

    byteSize() {
        if(!this.root) return 0;
        if(!this.root.next) return Buffer.byteLength(this.root.buffer);
        let bytes = 0;
        for(let item = this.root; item.next != null; item = item.next) bytes += Buffer.byteLength(item.buffer);
        return bytes;
    }

    get(path) {
        return new Promise((resolve, reject) => {
            if(this.root != null) {
                for(let item = this.root, prev = null; item.next != null; prev = item, item = item.next) {
                    if(item.path == path) {
                        resolve(item.buffer);
                        if(prev != null) {
                            prev.next = item.next;
                            item.next = this.root;
                            this.root = item;
                        }
                        return;
                    }
                }
            }

            fs.readFile(path, (err, buffer) => {
                if(err) return reject(err);
                resolve(buffer);
                if(Buffer.byteLength(buffer) < this.fileSizeLimit) {
                    this.size += 1;
                    this.root = {path, buffer, next: this.root};

                    if(this.size > this.maxFiles) {
                        if(!this.root || !this.root.next) {
                            this.root = null;
                        } else for(let item = this.root, prev = null; ; prev = item, item = item.next) {
                            if(item.next == null) {
                                prev.next = null;
                                this.size -= 1;
                                break;
                            }
                        }
                    }
                } else log(log.warn, 'Refused to cache "', path, '"! File exceeds size limit (', Buffer.byteLength(buffer), '/', this.fileSizeLimit, '). Consider using a readStream!')
            });
        });
    }
};