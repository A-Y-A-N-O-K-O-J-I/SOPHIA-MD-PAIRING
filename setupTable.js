/* const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ayanokoji:03DkFG7L3j62PTPd6SMrtw@floral-newt-3299.jxf.gcp-europe-west1.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full', // Use your DATABASE_URL here
});

async function createSessionsTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      base64_creds TEXT NOT NULL
    );
  `;

  try
    const client = await pool.connect();
    console.log('Connected to the database successfully.');
    await client.query(query);
    console.log('Table "sessions" created or already exists.');
    client.release();







// Automatically script is executed

*/
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ayanokoji:03DkFG7L3j62PTPd6SMrtw@floral-newt-3299.jxf.gcp-europe-west1.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full' , // Use your DATABASE_URL here
  }); 

  async function createSessionsTable() {
    const query = `
        CREATE TABLE IF NOT EXISTS sessions (
              session_id TEXT PRIMARY KEY,
                    base64_creds TEXT NOT NULL
                        );
                          `;

                            try {
                                const client = await pool.connect();
                                    console.log('Connected to the database successfully.');
                                        await client.query(query);
                                            console.log('Table "sessions" created or already exists.');
                                                client.release();
                                                  } catch (err) {
                                                      console.error('Error setting up database table:', err);
                                                        } finally {
                                                            await pool.end();
                                                              }
                                                              }

                                                              // Automatically run the function when this script is executed
                                                              module.exports = { createSessionsTable }