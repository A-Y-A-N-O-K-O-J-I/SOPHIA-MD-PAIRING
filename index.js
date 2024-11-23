/* NO ONE HELPED ME IN THE DEVELOPMENT OF QR CODE METHOD OF SOPHIA MD I DID IT ALL ON MY OWN
SO DON'T BELIEVE ANYONE THAT TELLS YOU THEY HELPED ME.
*/

const express = require('express');
const QRCode = require('qrcode');
const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const makeWASocket = require('@whiskeysockets/baileys').default;
const useMongoDBAuthState = require('./mongoAuthState');
const mongoURL = process.env.MONGODB_URI || 'mongodb+srv://ayanokojix:ejwRyGJ5Yieow4VK@cluster0.1rruy.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const dbName = 'whatsapp_sessions';
const collectionName = 'auth_info_baileys';
const app = express();
const port = 3000;
let qrCodeData = '';

async function generateSession() {
  const mongoClient = new MongoClient(mongoURL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  try {
    await mongoClient.connect();
    const collection = mongoClient.db(dbName).collection(collectionName);
    const { state, saveCreds } = await useMongoDBAuthState(collection);

    const extraRandom = Math.random().toString(36).substring(2, 12).toUpperCase();
    sessionId = `SOPHIA_MD-${uuidv4().replace(/-/g, '').toUpperCase()}${extraRandom}`;

    const sock = makeWASocket({
      auth: state,
    });

    sock.ev.on('connection.update', async (update) => {
      const { qr, connection } = update;
      if (qr) {
        qrCodeData = await QRCode.toDataURL(qr);
        console.log('QR Code generated for session ID:', sessionId);
      }
      if (connection === 'open') {
        await collection.insertOne({
          sessionId,
          creds: state.creds,
          status: 'generated',
          createdAt: new Date(),
        });
        console.log('Session stored successfully. Session ID:', sessionId);

        const loggedInUser = sock.user.id; // Get the logged-in user's ID
        await sock.sendMessage(loggedInUser, {
          text: `Your session ID is: ${sessionId}`,
        });
        console.log('Session ID sent to the user on WhatsApp:', loggedInUser);

        await sock.logout();
      }
      if (connection === 'timeout') {
        console.log('QR code timed out. Regenerating QR code...');
      }
    });

    sock.ev.on('creds.update', saveCreds);
  } catch (error) {
    console.error('Error generating session:', error);
  } finally {
    await mongoClient.close();
  }
}

generateSessionLoop();

app.get('/qr', (req, res) => {
  if (qrCodeData) {
    res.send(`
      <h1>Scan this QR Code</h1>
      <img src="${qrCodeData}" alt="QR Code" />
    `);
  } else {
    res.send('<h1>Generating QR code...</h1>');
  }
});

app.get('/', (req, res) => {
  res.redirect('/qr');
});

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
