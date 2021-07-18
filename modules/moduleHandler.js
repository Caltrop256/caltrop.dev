class Modules {
    static loadUncached(path, name) {
        delete require.cache[require.resolve(path)];
        Modules[name] = require(path);
    }
}



module.exports = Modules;