const betterSqlite3 = require('better-sqlite3');
const { initAuthCreds } = require('@whiskeysockets/baileys');

const db = betterSqlite3('./sessions.db');

// Initialize sessions table if not exists
db.prepare(`
  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    creds TEXT,
    keys TEXT
  )
`).run();

const reviveBuffers = (obj) => {
  if (obj && typeof obj === 'object') {
    if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
      return Buffer.from(obj.data); // Convert to real Buffer
    }
    // Recursively fix nested objects
    for (const key in obj) {
      obj[key] = reviveBuffers(obj[key]);
    }
  }
  return obj;
};

const useSQLiteAuthState = (sessionId) => {
  if (!sessionId) throw new Error("Session ID is required!");

  // Fetch session or initialize fresh
  let row = db.prepare('SELECT creds, keys FROM sessions WHERE session_id = ?').get(sessionId);
  let creds, keys;

  try {
  creds = row?.creds ? reviveBuffers(JSON.parse(row.creds)) : initAuthCreds();
    keys = row?.keys ? reviveBuffers(JSON.parse(row.keys)) : {};
  } catch (error) {
    console.error("Corrupt session data. Resetting...");
    creds = initAuthCreds();
    keys = {};
  }

  const saveState = () => {
    db.prepare('INSERT OR REPLACE INTO sessions (session_id, creds, keys) VALUES (?, ?, ?)')
      .run(sessionId, JSON.stringify(creds), JSON.stringify(keys));
  };

  return {
    state: {
      creds,
      keys: {
        get: (type, ids) => {
          const result = {};
          ids.forEach(id => {
            if (keys[type]?.[id]) result[id] = keys[type][id];
          });
          return result;
        },
        set: (data) => {
          Object.entries(data).forEach(([type, entries]) => {
            keys[type] = keys[type] || {};
            Object.assign(keys[type], entries);
          });
          saveState();
        },
        clear: () => {
          keys = {};
          saveState();
        }
      }
    },
    saveState
  };
};

module.exports = { useSQLiteAuthState };
