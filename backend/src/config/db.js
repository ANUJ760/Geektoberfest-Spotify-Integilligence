const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

//load the environment variables
dotenv.config({path: path.join(__dirname,'../../.env')});

const pool= new Pool({
    user: process.env.DB_USER || 'posgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'spotify_intelligence',
    password: process.env.DB_PASSWORD || 'devmanshu',
    port: parseInt(process.env.DB_PORT) || 5432,
});


//Test connection on server pool initialization
pool.on('connect',()=>{
    console.log('Postgres database connection pool established successfully');
});

pool.on('error',(err)=>{
    console.error('Unexpected database connection failure on idle client:',err);
    process.exit(-1);
});

module.exports={
    query: (text,params) => pool.query(text,params),
    pool: pool
};