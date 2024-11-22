const { proto } = require("@whiskeysockets/baileys/WAProto");
const { Curve, signedKeyPair } = require("@whiskeysockets/baileys/lib/Utils/crypto");
const { generateRegistrationId } = require("@whiskeysockets/baileys/lib/Utils/generics");
const { randomBytes } = require("crypto");

const initAuthCreds = () => {
  const identityKey = Curve.generateKeyPair();
  return {
    noiseKey: Curve.generateKeyPair(),
    signedIdentityKey: identityKey,
    signedPreKey: signedKeyPair(identityKey, 1),
    registrationId: generateRegistrationId(),
    advSecretKey: randomBytes(32).toString("base64"),
    processedHistoryMessages: [],
    nextPreKeyId: 1,
    firstUnuploadedPreKeyId: 1,
    accountSettings: { unarchiveChats: false },
  };
};

const BufferJSON = {
  replacer: (k, value) => {
    if (Buffer.isBuffer(value) || value instanceof Uint8Array || value?.type === "Buffer") {
      return {
        type: "Buffer",
        data: Buffer.from(value?.data || value).toString("base64"),
      };
    }
    return value;
  },

  reviver: (_, value) => {
    if (typeof value === "object" && !!value && (value.buffer === true || value.type === "Buffer")) {
      const val = value.data || value.value;
      return typeof val === "string" ? Buffer.from(val, "base64") : Buffer.from(val || []);
    }
    return value;
  },
};

module.exports = async (collection) => {
  const writeData = (data, id) => {
    const informationToStore = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
    const update = { $set: { ...informationToStore } };
    return collection.updateOne({ _id: id }, update, { upsert: true });
  };

  const readData = async (id) => {
    try {
      const data = JSON.stringify(await collection.findOne({ _id: id }));
      return JSON.parse(data, BufferJSON.reviver);
    } catch (error) {
      return null;
    }
  };

  const removeData = async (id) => {
    try {
      await collection.deleteOne({ _id: id });
    } catch (_a) {}
  };

  // Session ID-specific logic
  const storeSessionId = async (sessionId) => {
    const sessionData = { _id: "sessionId", sessionId, createdAt: new Date() };
    await collection.updateOne({ _id: "sessionId" }, { $set: sessionData }, { upsert: true });
    console.log(`Session ID stored: ${sessionId}`);
  };

  const getSessionId = async () => {
    const session = await collection.findOne({ _id: "sessionId" });
    return session?.sessionId || null;
  };

  const clearSessionId = async () => {
    await collection.deleteOne({ _id: "sessionId" });
    console.log("Session ID cleared.");
  };

  const creds = (await readData("creds")) || initAuthCreds();
  const clearAuthState = async (sessionId) => {
  try {
    const sessionData = await collection.findOne({ _id: sessionId });
    if (sessionData) {
      // Check if the session is logged out (you can use connection status here)
      const status = sessionData?.status; // Example: Assume you store status in session data
      if (status === 'loggedOut') {
        await collection.deleteOne({ _id: sessionId });
        console.log(`Session ${sessionId} cleared due to logout.`);
      }
    }
  } catch (error) {
    console.error("Error clearing session:", error);
  }
};

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === "app-state-sync-key") {
                value = proto.Message.AppStateSyncKeyData.fromObject(data);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(value, key) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData(creds, "creds"),
    storeSessionId,
    getSessionId,
    clearAuthState,
    clearSessionId,
  };
};
