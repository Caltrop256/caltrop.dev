const mysql = require('mysql');

module.exports = function queryFactory(config) {
    const pool = mysql.createPool(Object.assign({multipleStatements: true}, config));
    return db => {
        const query = (sql, escape) => new Promise((resolve, reject) => {
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
        return Object.assign(query, {
            insert(table, items) {
                let sql = 'INSERT INTO `' + table + '` (';
                const keys = Object.getOwnPropertyNames(items);
                for(let i = 0; i < keys.length; ++i) {
                    if(i) sql += ', ';
                    sql += '`' + keys[i] + '`';
                }
                sql += ') VALUES (' + new Array(keys.length).fill('?').join(',') + ');';
                return query(sql, keys.map(k => items[k]));
            }
        });
    }
}