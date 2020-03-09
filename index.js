const { Client: PGClient, Pool: PGPool } = require('pg');

async function createElement(e) {
    const pgClient = new PGClient({
        host: process.env.PGHOST,
        port: process.env.PGPORT,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
    });
    await pgClient.connect();
  
    let i;
    let j;
    
    for (i = 0; i < e.keys.length; i++) {
        const key = e.keys[i];
        for (j = 0; j < e.selectors.length; j++) {
        const selector = e.selectors[j];
        await pgClient.query(
            'INSERT INTO element(key, description, selector, domain, url) VALUES($1, $2, $3, $4, $5)',
            [key, e.description, selector, e.domain, e.url],
        );
        }
    }

    await pgClient.end();
}

exports.handler = async (body, context, callback) => {
  return createElement(body)
    .then(() => callback(null, { statusCode: 200 }))
    .catch((e) => {
      console.log(e);
      callback(null, { statusCode: 500, body: { message: e.message } });
    });
};

exports.createElement = async (body) => {
  return createElement(body);
};
