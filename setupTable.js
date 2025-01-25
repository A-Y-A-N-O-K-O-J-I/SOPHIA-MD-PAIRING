const { Pool } = require('pg');
const { djxndjjdkddnd } = require('./hm');

// Database connection
const pool = new Pool({
    connectionString: djxndjjdkddnd, // Use your DATABASE_URL here
    ssl: {
        rejectUnauthorized: false  // This allows self-signed certificates, adjust as needed
    }
});

async function createSessionsTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      base64_creds TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Add created_at column
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
