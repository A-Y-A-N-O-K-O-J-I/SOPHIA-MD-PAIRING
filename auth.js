const betterSqlite3 = require('better-sqlite3');
const { initAuthCreds, BufferJSON, proto } = require('baileys');
const fs = require('fs');

let db = null;

function getDB() {
  if (!db) {
    db = betterSqlite3('./sessions.db');
    
    // Create tables
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
  }
  return db;
}

function readCreds(sessionId) {
  try {
    const result = getDB().prepare('SELECT creds FROM sessions WHERE session_id = ?').get(sessionId);
    
    if (!result) return null;
    
    const creds = result.creds;
    return typeof creds === 'string' ? JSON.parse(creds, BufferJSON.reviver) : creds;
  } catch (error) {
    console.error("Error reading creds:", error);
    return null;
  }
}

function writeCreds(sessionId, creds) {
  if (!creds) return;
  
  try {
    getDB().prepare(
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
  
  try {
    ids.forEach((id) => {
      const result = getDB().prepare(
        'SELECT value FROM keys WHERE session_id = ? AND category = ? AND key_id = ?'
      ).get(sessionId, type, id);
      
      if (!result) return;
      
      let value = result.value;
      
      if (value && typeof value === 'string') {
        value = JSON.parse(value, BufferJSON.reviver);
      }
      
      if (type === "app-state-sync-key" && value) {
        value = proto.Message.AppStateSyncKeyData.fromObject(value);
      }
      
      data[id] = value;
    });
  } catch (error) {
    console.error("Error reading keys:", error);
  }
  
  return data;
}

function writeKeys(data, sessionId) {
  try {
    for (const category in data) {
      for (const key_id in data[category]) {
        const value = data[category][key_id];
        
        if (value) {
          getDB().prepare(
            `INSERT INTO keys(session_id, category, key_id, value)
             VALUES(?, ?, ?, ?)
             ON CONFLICT(category, key_id, session_id) DO UPDATE SET value = excluded.value`
          ).run(sessionId, category, key_id, JSON.stringify(value, BufferJSON.replacer));
        } else {
          getDB().prepare(
            'DELETE FROM keys WHERE session_id = ? AND category = ? AND key_id = ?'
          ).run(sessionId, category, key_id);
        }
      }
    }
  } catch (error) {
    console.error("Error writing keys:", error);
  }
}

function clearSession(sessionId) {
  try {
    const db = getDB();
    db.transaction(() => {
      db.prepare('DELETE FROM keys WHERE session_id = ?').run(sessionId);
      db.prepare('DELETE FROM sessions WHERE session_id = ?').run(sessionId);
    })();
  } catch (error) {
    console.error("Error clearing session:", error);
  }
}

function getAllKeysForSession(sessionId) {
  return getDB().prepare('SELECT category, key_id, value FROM keys WHERE session_id = ?').all(sessionId);
}

function useSQLiteAuthState(sessionId) {
  if (!sessionId) throw new Error("Session ID is required!");

  let creds = readCreds(sessionId);
  
  // FIX: If no creds exist, create them AND save to DB immediately
  if (!creds) {
    creds = initAuthCreds();
    writeCreds(sessionId, creds); // ← ADD THIS LINE
  }

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
    },
    clearSession: () => {
      clearSession(sessionId);
    }
  };
}

module.exports = { useSQLiteAuthState, clearSession, getAllKeysForSession };