const { Client } = require('pg');
const fs = require('fs');
require("dotenv").config()
const postgresUrl = process.env.DATABASE_URL;
if (!postgresUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

async function migrateSessions() {
  // Import the same DB instance used in auth.js
  const betterSqlite3 = require('better-sqlite3');
  
  // Check if DB exists
  if (!fs.existsSync('sessions.db')) {
    console.log('⚠️ No sessions.db found, nothing to migrate');
    return false;
  }
  
  const sqliteDb = betterSqlite3('sessions.db', { readonly: true }); // Read-only to prevent conflicts

  const pgClient = new Client({
    connectionString: postgresUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
    query_timeout: 60000,
    statement_timeout: 60000,
  });

  try {
    await pgClient.connect();
    console.log('✅ Connected to PostgreSQL');

    // Create tables
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL UNIQUE,
        creds TEXT NOT NULL
      )
    `);

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

    await pgClient.query(`
      CREATE INDEX IF NOT EXISTS idx_keys_session_id ON keys(session_id)
    `);

    // Fetch from SQLite (synchronous)
    const sqliteSessions = sqliteDb.prepare('SELECT * FROM sessions').all();

    if (sqliteSessions.length === 0) {
      console.log('⚠️ No sessions found in SQLite');
      throw new Error('No sessions to migrate');
    }

    console.log(`📦 Found ${sqliteSessions.length} session(s). Migrating...`);

    // Migrate sessions
    for (const session of sqliteSessions) {
      await pgClient.query(
        `INSERT INTO sessions (session_id, creds)
         VALUES ($1, $2)
         ON CONFLICT (session_id) DO UPDATE SET creds = EXCLUDED.creds`,
        [session.session_id, session.creds]
      );
    }
    console.log('✅ Sessions migrated');

    // Fetch keys (synchronous)
    const sqliteKeys = sqliteDb.prepare('SELECT * FROM keys').all();

    if (sqliteKeys.length > 0) {
      console.log(`📦 Found ${sqliteKeys.length} key(s). Migrating...`);

      const batchSize = 50; // Safer batch size
      const totalBatches = Math.ceil(sqliteKeys.length / batchSize);

      for (let i = 0; i < sqliteKeys.length; i += batchSize) {
        const batch = sqliteKeys.slice(i, i + batchSize);
        const currentBatch = Math.floor(i / batchSize) + 1;
        
        console.log(`📤 Batch ${currentBatch}/${totalBatches}...`);

        const values = [];
        const placeholders = [];
        
        batch.forEach((key, index) => {
          const offset = index * 4;
          placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
          values.push(key.session_id, key.category, key.key_id, key.value);
        });

        const query = `
          INSERT INTO keys (session_id, category, key_id, value)
          VALUES ${placeholders.join(', ')}
          ON CONFLICT (category, key_id, session_id) DO UPDATE SET value = EXCLUDED.value
        `;

        try {
          await pgClient.query(query, values);
        } catch (batchError) {
          console.error(`❌ Batch ${currentBatch} failed:`, batchError);
          console.log('🔄 Retrying individually...');
          
          for (const key of batch) {
            try {
              await pgClient.query(
                `INSERT INTO keys (session_id, category, key_id, value)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (category, key_id, session_id) DO UPDATE SET value = EXCLUDED.value`,
                [key.session_id, key.category, key.key_id, key.value]
              );
            } catch (err) {
              console.error(`⚠️ Failed key ${key.key_id}:`, err.message);
            }
          }
        }
      }
    }

    // Verify migration
    const sessionCount = await pgClient.query('SELECT COUNT(*) FROM sessions');
    const keyCount = await pgClient.query('SELECT COUNT(*) FROM keys');
    
    console.log(`✅ Migration complete!`);
    console.log(`   Sessions: ${sessionCount.rows[0].count}`);
    console.log(`   Keys: ${keyCount.rows[0].count}`);

    return true;

  } catch (err) {
    console.error('❌ Migration failed:', err); // Full error, not just message
    throw err;
  } finally {
    sqliteDb.close(); // Close SQLite (opened in this function)
    await pgClient.end();
  }
}

module.exports = { migrateSessions };