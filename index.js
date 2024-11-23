const express = require('express');
const QRCode = require('qrcode');
const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const makeWASocket = require('@whiskeysockets/baileys').default;
const useMongoDBAuthState = require('./lib/mongoAuthState');

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

    const extraRandom = Math.random().toString(36).substring(2, 12).toUpperCase();
    sessionId = `SOPHIA_MD-${uuidv4().replace(/-/g, '').toUpperCase()}${extraRandom}`;

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
        // Store the session data in MongoDB
        await collection.insertOne({
          sessionId,
          creds: state.creds,
          status: 'generated',
          createdAt: new Date(),
        });

        console.log('Session stored successfully. Session ID:', sessionId);

        // Send session ID to the logged-in WhatsApp user
        const loggedInUser = sock.user.id // Get the logged-in user's ID
        await sock.sendMessage(loggedInUser, {
          text: `Your session ID is: ${sessionId}`,
        });

        console.log('Session ID sent to the user on WhatsApp:', loggedInUser);
        await sock.logout(); // Log out after storing session
      }
    });

    sock.ev.on('creds.update', saveCreds);
  } catch (error) {
    console.error('Error generating session:', error);
  } finally {
    await mongoClient.close();
  }
}

// Generate the session and QR code on app start
generateSession();

// Serve the QR code on a specific route
app.get('/qr', (req, res) => {
  if (qrCodeData) {
    res.send(`<h1>Scan this QR Code</h1><img src="${qrCodeData}" alt="QR Code" />`);
  } else {
    res.send('<h1>QR Code is not available yet. Please wait.</h1>');
  }
});


app.get('/', (req, res) => {
  res.redirect('/qr');
});


app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

// I added a new route for the root URL ("/") that redirects to the "/qr" route. This way, when you visit the root URL, you'll be automatically taken to the QR code page.
