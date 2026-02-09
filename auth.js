const betterSqlite3 = require('better-sqlite3');
const { initAuthCreds, BufferJSON, proto } = require('baileys');

const db = betterSqlite3('./sessions.db');

// Create tables with proper structure
db.prepare(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE,
    creds TEXT NOT NULL
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    key_id TEXT NOT NULL,
    value TEXT NOT NULL,
    session_id TEXT NOT NULL,
    UNIQUE(category, key_id, session_id),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
  )
`).run();

const reviveBuffers = (obj) => {
  if (obj && typeof obj === 'object') {
    if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
      return Buffer.from(obj.data);
    }
    for (const key in obj) {
      obj[key] = reviveBuffers(obj[key]);
    }
  }
  return obj;
};

function readCreds(sessionId) {
  try {
    const result = db.prepare('SELECT creds FROM sessions WHERE session_id = ?').get(sessionId);
    
    if (!result) return null;
    
    const creds = result.creds;
    
    if (typeof creds === 'string') {
      return JSON.parse(creds, BufferJSON.reviver);
    } else {
      return creds;
    }
  } catch (error) {
    console.error("Error reading creds:", error);
    return null;
  }
}

function writeCreds(sessionId, creds) {
  if (!creds) return;
  
  try {
    db.prepare(
      `INSERT INTO sessions (session_id, creds)
       VALUES (?, ?)
       ON CONFLICT(session_id) DO UPDATE SET creds = excluded.creds`
    ).run(sessionId, JSON.stringify(creds, BufferJSON.replacer));
  } catch (error) {
    console.error("Failed to write creds:", error);
  }
}

function readKeys(type, ids, sessionId) {
  const data = {};
  
  ids.forEach((id) => {
    const result = db.prepare(
      'SELECT value FROM keys WHERE session_id = ? AND category = ? AND key_id = ?'
    ).get(sessionId, type, id);
    
    if (!result) return;
    
    let value = result.value;
    
    if (value) {
      if (typeof value === 'string') {
        value = JSON.parse(value, BufferJSON.reviver);
      }
    }
    
    if (type === "app-state-sync-key" && value) {
      value = proto.Message.AppStateSyncKeyData.fromObject(value);
    }
    
    data[id] = value;
  });
  
  return data;
}

function writeKeys(data, sessionId) {
  for (const category in data) {
    for (const key_id in data[category]) {
      const value = data[category][key_id];
      
      if (value) {
        db.prepare(
          `INSERT INTO keys(session_id, category, key_id, value)
           VALUES(?, ?, ?, ?)
           ON CONFLICT(category, key_id, session_id) DO UPDATE SET value = excluded.value`
        ).run(sessionId, category, key_id, JSON.stringify(value, BufferJSON.replacer));
      } else {
        db.prepare(
          'DELETE FROM keys WHERE session_id = ? AND category = ? AND key_id = ?'
        ).run(sessionId, category, key_id);
      }
    }
  }
}

function useSQLiteAuthState(sessionId) {
  if (!sessionId) throw new Error("Session ID is required!");

  const creds = readCreds(sessionId) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: (type, ids) => {
          return readKeys(type, ids, sessionId);
        },
        set: (data) => {
          return writeKeys(data, sessionId);
        }
      }
    },
    saveState: () => {
      writeCreds(sessionId, creds);
    }
  };
}

module.exports = { useSQLiteAuthState };