const { proto } = require('@whiskeysockets/baileys/WAProto');
const { Curve, signedKeyPair } = require('@whiskeysockets/baileys/lib/Utils/crypto');
const { generateRegistrationId } = require('@whiskeysockets/baileys/lib/Utils/generics');
const { randomBytes } = require('crypto');

const initAuthCreds = () => ({
  noiseKey: Curve.generateKeyPair(),
  signedIdentityKey: Curve.generateKeyPair(),
  signedPreKey: signedKeyPair(Curve.generateKeyPair(), 1),
  registrationId: generateRegistrationId(),
  advSecretKey: randomBytes(32).toString('base64'),
  processedHistoryMessages: [],
  nextPreKeyId: 1,
  firstUnuploadedPreKeyId: 1,
  accountSettings: {
    unarchiveChats: false,
  },
});

module.exports = async (collection) => {
  const writeData = (data, id) => collection.updateOne({ _id: id }, { $set: data }, { upsert: true });
  const readData = async (id) => collection.findOne({ _id: id });

  const creds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          for (const id of ids) {
            data[id] = await readData(`${type}-${id}`);
          }
          return data;
        },
        set: async (data) => {
          for (const [type, keys] of Object.entries(data)) {
            for (const [id, value] of Object.entries(keys)) {
              const key = `${type}-${id}`;
              if (value) {
                await writeData(value, key);
              } else {
                await collection.deleteOne({ _id: key });
              }
            }
          }
        },
      },
    },
    saveCreds: () => writeData(creds, 'creds'),
  };
};
