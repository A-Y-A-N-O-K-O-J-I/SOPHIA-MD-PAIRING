const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');

// SQLite DB (source)
const sqliteDb = new sqlite3.Database('sessions.db');

// PostgreSQL connection URL (format: "postgresql://user:password@host:port/database")
const postgresUrl = 'postgresql://test_x_user:4E1Q2Oo05k0hJ9TUK7IfPo3m54ltMmZs@dpg-d06kpgbuibrs73emt7rg-a.oregon-postgres.render.com/test_x'; // Replace with your actual URL

async function migrateSessions() {
  const pgClient = new Client({
    connectionString: postgresUrl,
    ssl: { rejectUnauthorized: false }, // Only if SSL is needed
  });

  try {
    // Connect to PostgreSQL
    await pgClient.connect();
    console.log('✅ Connected to PostgreSQL');

    // Create the sessions table in PostgreSQL (if it doesn't exist)
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        creds TEXT,
        keys TEXT
      );
    `);
    console.log('✅ Created/Verified "sessions" table in PostgreSQL');

    // Fetch data from SQLite
    const sqliteRows = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM sessions', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    if (sqliteRows.length === 0) {
      console.log('⚠️ No data found in SQLite sessions table.');
      } else {
        console.log(`📦 Found ${sqliteRows.length} records in SQLite. Migrating...`);

        // Insert data into PostgreSQL
        for (const row of sqliteRows) {
          await pgClient.query(
            'INSERT INTO sessions (session_id, creds, keys) VALUES ($1, $2, $3) ON CONFLICT (session_id) DO NOTHING',
            [row.session_id, row.creds, row.keys]
          );
        }
        console.log('🚀 Migration completed!');
      }
  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    await pgClient.end();
    sqliteDb.close();
  }
}

// Run the migration
module.exports = {migrateSessions}
