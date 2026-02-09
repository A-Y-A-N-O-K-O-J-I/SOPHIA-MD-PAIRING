const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');

const sqliteDb = new sqlite3.Database('sessions.db');

const postgresUrl = process.env.DATABASE_URL || 
  "postgresql://test_postgress_un37_user:JXw5loPD6CFUKKbt3NHnWdzGAj5fRlAI@dpg-d62q16soud1c73d46tn0-a.oregon-postgres.render.com/test_postgress_un37";

async function migrateSessions() {
  const pgClient = new Client({
    connectionString: postgresUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Connect to PostgreSQL
    await pgClient.connect();
    console.log('✅ Connected to PostgreSQL');

    // Create the sessions table in PostgreSQL
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL UNIQUE,
        creds TEXT NOT NULL
      )
    `);
    console.log('✅ Created/Verified "sessions" table in PostgreSQL');

    // Create the keys table in PostgreSQL
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS keys (
        id SERIAL PRIMARY KEY,
        category TEXT NOT NULL,
        key_id TEXT NOT NULL,
        value TEXT NOT NULL,
        session_id TEXT NOT NULL,
        UNIQUE(category, key_id, session_id),
        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
      )
    `);
    console.log('✅ Created/Verified "keys" table in PostgreSQL');

    // Fetch sessions from SQLite
    const sqliteSessions = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM sessions', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    if (sqliteSessions.length === 0) {
      console.log('⚠️ No sessions found in SQLite.');
      throw new Error('No sessions to migrate');
    }

    console.log(`📦 Found ${sqliteSessions.length} session(s) in SQLite. Migrating...`);

    // Migrate sessions
    for (const session of sqliteSessions) {
      await pgClient.query(
        `INSERT INTO sessions (session_id, creds)
         VALUES ($1, $2)
         ON CONFLICT (session_id) DO UPDATE SET creds = EXCLUDED.creds`,
        [session.session_id, session.creds]
      );
    }
    console.log('✅ Sessions migrated successfully');

    // Fetch keys from SQLite
    const sqliteKeys = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM keys', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    if (sqliteKeys.length > 0) {
      console.log(`📦 Found ${sqliteKeys.length} key(s) in SQLite. Migrating...`);

      // Migrate keys
      for (const key of sqliteKeys) {
        await pgClient.query(
          `INSERT INTO keys (session_id, category, key_id, value)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (category, key_id, session_id) DO UPDATE SET value = EXCLUDED.value`,
          [key.session_id, key.category, key.key_id, key.value]
        );
      }
      console.log('✅ Keys migrated successfully');
    } else {
      console.log('⚠️ No keys found in SQLite.');
    }

    console.log('🚀 Migration completed successfully!');
    return true; // Indicate success

  } catch (err) {
    console.error('❌ Migration error:', err.message);
    throw err; // Re-throw to let caller handle it
  } finally {
    await pgClient.end();
    sqliteDb.close();
  }
}

module.exports = { migrateSessions };