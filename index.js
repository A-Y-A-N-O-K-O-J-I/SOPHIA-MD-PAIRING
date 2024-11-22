const express = require('express');
const QRCode = require('qrcode');
const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const makeWASocket = require('@whiskeysockets/baileys').default;
const useMongoDBAuthState = require('./mongoAuthState');

const mongoURL = process.env.MONGODB_URI || 'mongodb://localhost:27017';
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
        console.log('QR Code generated for session ID:', sessionId);
      }
      if (connection === 'open') {
        
        await sock.sendMessage(sock.user.id, { text: `Session ID: ${sessionId}` });
        console.log('Session ID sent to user:', sessionId);

        
        await collection.insertOne({
          sessionId,
          creds: state.creds,
          status: 'generated',
          createdAt: new Date(),
        });

        console.log('Session stored successfully. Session ID:', sessionId);
        await sock.logout(); 
      }
    });

    sock.ev.on('creds.update', saveCreds);
  } catch (error) {
    console.error('Error generating session:', error);
  } finally {
    await mongoClient.close();
  }
}


generateSession();

// Serve the QR code on a specific route
app.get('/', (req, res) => {
  if (qrCodeData) {
    res.send(`<h1>Scan this QR Code</h1><img src="${qrCodeData}" alt="QR Code" />`);
  } else {
    res.send('<h1>QR Code is not available yet. Please wait.</h1>');
  }
});

// Start the Express server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
