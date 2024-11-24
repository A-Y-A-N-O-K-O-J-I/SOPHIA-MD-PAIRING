/* NO ONE HELPED ME IN THE DEVELOPMENT OF QR CODE METHOD OF SOPHIA MD I DID IT ALL ON MY OWN
SO DON'T BELIEVE ANYONE THAT TELLS YOU THEY HELPED ME.
*/
const express = require('express');
const QRCode = require('qrcode');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const makeWASocket = require('@whiskeysockets/baileys').default;
const useMongoDBAuthState = require('./mongoAuthState');

const mongoURL = process.env.MONGODB_URI || '';
const dbName = 'whatsapp_sessions';
const collectionName = 'auth_info_baileys';

const app = express();
const port = 5000;

let qrCodeData = '';
let sessionStatus = 'waiting';

// Set up CORS middleware (with optional local development support)
app.use(cors({
  origin: ['https://sophia-md-pair.vercel.app', 'http://localhost:3000'], // Add local dev support if necessary
  methods: ['GET'],
  optionsSuccessStatus: 200,
}));

let retryAttempts = 0;
const maxRetries = 5;



app.get('/qr', (req, res) => {
  if (sessionStatus === 'expired') {
    return res.send('<h1>QR Code expired. Reload the page to generate a new one.</h1>');
  }

  if (qrCodeData) {
    return res.send(`
      <h1>Scan this QR Code</h1>
      <img src="${qrCodeData}" alt="QR Code" />
      <p>Status: ${sessionStatus === 'waiting' ? 'Waiting for scan...' : ''}</p>
    `);
  } else {
    return res.send('<h1>Generating QR Code...</h1>');
  }
});

app.get('/status', (req, res) => {
  res.json({ status:const generateSession = async () => {
  const mongoClient = new MongoClient(mongoURL, { ssl: true, tls: true });

  try {
    await mongoClient.connect();
    const collection = mongoClient.db(dbName).collection(collectionName);

    const { state, saveCreds } = await useMongoDBAuthState(collection);
    const extraRandom = Math.random().toString(36).substring(2, 12).toUpperCase();
    const sessionId = `SOPHIA_MD-${uuidv4().replace(/-/g, '').toUpperCase()}${extraRandom}`;

    const sock = makeWASocket({ auth: state });

    sock.ev.on('connection.update', async (update) => {
      const { qr, connection, lastDisconnect } = update;

      if (qr) {
        try {
          qrCodeData = await QRCode.toDataURL(qr);
        } catch (error) {
          console.error('Error generating QR code:', error);
        }
        sessionStatus = 'waiting';
        console.log('New QR code generated:', sessionId);
      }

      if (connection === 'open') {
        sessionStatus = 'scanned';
        qrCodeData = ''; // Clear QR code after successful scan

        // Store session data in MongoDB
        await collection.insertOne({
          sessionId,
          creds: state.creds,
          status: 'generated',
          createdAt: new Date(),
        });
        console.log('Session stored successfully:', sessionId);

        // Send session ID to the user
        const userId = sock.user.id;
        const message = `Your session ID is: ${sessionId}`;
        await sock.sendMessage(userId, { text: message });
        console.log(`Session ID sent to user ${userId}: ${sessionId}`);

        // Disconnect WebSocket after 1 minute
        setTimeout(() => {
          if (sock.ws) {
            console.log('Disconnecting WebSocket...');
            sock.ws.close(); // Disconnect WebSocket without logging out
            sessionStatus = 'disconnected';
            console.log('WebSocket connection closed.');
          } else {
            console.log('No active WebSocket connection to close.');
          }
        }, 60000); // Disconnect after 1 minute
      }

      if (connection === 'close') {
        const reason = lastDisconnect?.error?.output?.statusCode;
        if (reason === 408) {
          sessionStatus = 'expired';
          console.log('QR Code expired. Retrying...');
          if (retryAttempts < maxRetries) {
            retryAttempts++;
            console.log(`Retry attempt #${retryAttempts}`);
            setTimeout(() => generateSession(), 15000); // Retry after 15 seconds
          } else {
            console.log('Max retries reached. Stopping...');
          }
          return;
        } else {
          sessionStatus = 'error';
          console.error('Connection error:', reason);
        }
      }

      sock.ev.on('creds.update', saveCreds);
    });
  } catch (error) {
    console.error('Error generating session:', error);
  } finally {
    await mongoClient.close();
  }
}; sessionStatus });
});

app.get('/', (req, res) => {
  res.redirect('/qr');
});

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
  generateSession();
});
