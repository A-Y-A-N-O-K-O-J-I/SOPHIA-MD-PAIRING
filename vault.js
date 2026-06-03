const { Pool } = require('pg');
const { BufferJSON } = require('baileys');

let pool = null;

async function getPool(vaultUrl) {
  if (pool) return pool;

  // Try with SSL first (required for most cloud Postgres providers).
  // If the server doesn't support SSL, fall back to a plain connection.
  const sslPool = new Pool({ connectionString: vaultUrl, ssl: { rejectUnauthorized: false } });
  try {
    await sslPool.query('SELECT 1');
    pool = sslPool;
  } catch (err) {
    if (err.message.toLowerCase().includes('ssl')) {
      await sslPool.end().catch(() => {});
      pool = new Pool({ connectionString: vaultUrl, ssl: false });
    } else {
      await sslPool.end().catch(() => {});
      throw err;
    }
  }

  return pool;
}

async function saveToVault(vaultUrl, sessionId, phoneNumber, creds, keyRows) {
  const pg = await getPool(vaultUrl);
  await pg.query(`
    CREATE TABLE IF NOT EXISTS vault_sessions (
      session_id TEXT PRIMARY KEY,
      phone_number TEXT,
      creds TEXT NOT NULL,
      keys TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pg.query(
    `INSERT INTO vault_sessions (session_id, phone_number, creds, keys)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (session_id) DO UPDATE SET
       creds = EXCLUDED.creds, keys = EXCLUDED.keys, created_at = NOW()`,
    [
      sessionId,
      phoneNumber,
      JSON.stringify(creds, BufferJSON.replacer),
      JSON.stringify(keyRows),
    ]
  );
}

module.exports = { saveToVault };
