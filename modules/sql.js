const mysql = require('mysql');

module.exports = function queryFactory(config) {
    const pool = mysql.createPool(Object.assign({multipleStatements: true}, config));
    return db => (sql, escape) => new Promise((resolve, reject) => {
        pool.getConnection((err, con) => {
            if(err) return reject(err);
            con.changeUser({database: db}, err => {
                if(err) return reject(err);
                if(typeof sql != 'string' || !sql.length) {
                    con.release();
                    reject(new TypeError('Empty or non-String Query!'));
                } else {
                    const opts = {sql};
                    if(Array.isArray(escape) && escape.length) opts.values = escape;
                    con.query(opts, (err, res, fields) => {
                        con.release();
                        if(err) return reject(err);
                        resolve([res, fields]);
                    });
                }
            });
        });
    });
}