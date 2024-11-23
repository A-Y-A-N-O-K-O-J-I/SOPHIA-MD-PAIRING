/* NO ONE HELPED ME IN THE DEVELOPMENT OF QR CODE METHOD OF SOPHIA MD I DID IT ALL ON MY OWN
SO DON'T BELIEVE ANYONE THAT TELLS YOU THEY HELPED ME.
*/

const express = require('express');
const QRCode = require('qrcode');
const cors = require('cors'); // Import CORS
const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const makeWASocket = require('@whiskeysockets/baileys').default;
const useMongoDBAuthState = require('./mongoAuthState');

const mongoURL = process.env.MONGODB_URI || '';
const dbName = 'whatsapp_sessions';
const collectionName = 'auth_info_baileys';

const app = express();
const port = 5000;

let qrCodeData = ''; // Holds the current QR code data URL
let sessionStatus = 'waiting'; // 'waiting', 'scanned', 'expired', 'error'

// Set up CORS middleware
const corsOptions = {
  origin: 'https://sophia-md-pair.vercel.app', // Replace with your actual Vercel frontend URL
  methods: ['GET'], // Allow only necessary methods
  optionsSuccessStatus: 200, // Compatibility for older browsers
};
app.use(cors(corsOptions)); // Apply CORS to all routes

let retryAttempts = 0; // To keep track of the number of retries
const maxRetries = 5;  // Max retries before giving up

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
    const sessionId = `SOPHIA_MD-${uuidv4().replace(/-/g, '').toUpperCase()}${extraRandom}`;

    const sock = makeWASocket({
      auth: state,
    });


    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
      const { qr, connection, lastDisconnect } = update;

      if (qr) {
        qrCodeData = await QRCode.toDataURL(qr); // Generate QR code data URL
        sessionStatus = 'waiting'; // Reset status to waiting
        console.log('New QR code generated:', sessionId);
      }

      if (connection === 'open') {
        sessionStatus = 'scanned';
        qrCodeData = ''; // Clear QR code after successful scan
        await collection.insertOne({
          sessionId,
          creds: state.creds,
          status: 'generated',
          createdAt: new Date(),
        });
        console.log('Session stored successfully:', sessionId);

        // Send session ID to the user via WhatsApp
        const userId = sock.user.id;
        const message = `Your session ID is: ${sessionId}`;
        await sock.sendMessage(userId, { text: message });
        console.log(`Session ID sent to user ${userId}: ${sessionId}`);

        setTimeout(() => {
  if (sock.ws) {
    sock.ws.close(); // Disconnect WebSocket without logging out
    console.log('Bot disconnected without logging out. Session ID:', sessionId);
  } else {
    console.log('No active WebSocket connection to close.');
  }
}, 60000); // Disconnect after 1 minute

      try {
  if (connection === 'close') {
    const reason = lastDisconnect?.error?.output?.statusCode;
    
    if (reason === 408) {
      sessionStatus = 'expired';
      console.log('QR Code expired. Retrying...');
      generateSession(); // Retry session generation on timeout
    } else {
      sessionStatus = 'error';
      console.error('Connection error:', reason);

      // Retry logic for error 500 (stream errored out)
      if (retryAttempts < maxRetries) {
        retryAttempts++;
        console.log(`Retrying session generation, attempt ${retryAttempts}/${maxRetries}...`);
        setTimeout(generateSession, 5000); // Retry after 5 seconds
      } else {
        console.error('Max retries reached. Unable to generate session.');
      }
    }
  }

  sock.ev.on('creds.update', saveCreds);

} catch (error) {
  console.error('Error generating session:', error);
} finally {
  await mongoClient.close();
  // Ensure new session generation starts, even if there was an error
  setTimeout(generateSession, 5000); // Retry session generation after 5 seconds
}

// Start generating sessions right away
generateSession();

// Serve QR code and session status
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

// Check session status
app.get('/status', (req, res) => {
  res.json({ status: sessionStatus });
});

// Default route
app.get('/', (req, res) => {
  res.redirect('/qr');
});

// Start the server and generate session at the beginning
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
  generateSession(); // Ensure session starts generating when the server starts
});
