const { v4: uuidv4 } = require('uuid');
const { MongoClient } = require('mongodb');
const QRCode = require('qrcode');
const express = require('express'); // Add express to handle web server
const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason } = require('@whiskeysockets/baileys');
const useMongoDBAuthState = require('./lib/mongoAuthState');
const config = require('./config'); // Add config to use session ID from config

const mongoURL = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = 'whatsapp_sessions';
const collectionName = 'auth_info_baileys';
let qrCodeData = '';

const app = express();
const port = 3000; // Express server port

async function generateSession() {
  const mongoClient = new MongoClient(mongoURL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  try {
    // Connect to MongoDB and initialize credentials
    await mongoClient.connect();
    const collection = mongoClient.db(dbName).collection(collectionName);
    const { state, saveCreds } = await useMongoDBAuthState(collection);

    const sessionId = `SOPHIA_MD-${uuidv4()}`; // Generate session ID

    // Initialize socket
    const sock = makeWASocket({
      auth: state,
    });

    // Handle QR Code generation and send to the user
    sock.ev.on('connection.update', async (update) => {
      const { qr, connection } = update;
      if (qr) {
        qrCodeData = await QRCode.toDataURL(qr);
      }
      if (connection === 'open') {
        // Send the session ID to the user
        await sock.sendMessage(sock.user.id, {
          text: `Your session ID is: ${sessionId}`,
        });

        // Store the session data in MongoDB
        await collection.insertOne({
          sessionId,
          creds: state.creds,
          status: 'generated',
          createdAt: new Date(),
        });

        console.log('Session stored successfully. Session ID:', sessionId);

        await sock.logout(); // Log out after storing session
        console.log('Logged out after session creation');
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // Start Express server to display QR code
    app.get('/qrcode', (req, res) => {
      res.send(`<h1>Scan this QR code to authenticate</h1><img src="${qrCodeData}" />`);
    });

    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Error generating session:', error);
  } finally {
    await mongoClient.close();
  }
}

generateSession();
