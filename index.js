const express = require('express');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { MongoClient } = require('mongodb');
const useMongoDBAuthState = require('./mongoAuthState');
const { DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid'); // Import uuid for session ID generation
const config = require('./config'); // Import config.js

// Set up Express for serving the QR code
const app = express();
const port = config.PORT; // Use the port from config.js
const mongoURL = config.MONGODB_URI; // Use MongoDB URI from config.js

// Variable to hold QR code data
let qrCodeData = '';

// Function to generate a unique session ID
function generateSessionId() {
  const sessionId = `SOPHIA_MD-${uuidv4().replace(/-/g, '').toUpperCase()}`; // Generate and format the session ID
  return sessionId;
}

// Function to store session ID in MongoDB
async function storeSessionId(sessionId, collection) {
  const sessionData = { _id: sessionId, createdAt: new Date() }; // Store session ID with timestamp
  await collection.updateOne({ _id: sessionId }, { $set: sessionData }, { upsert: true });
  console.log(`Session ID stored: ${sessionId}`);
}

// MongoDB connection logic
async function connectionLogic() {
  const mongoClient = new MongoClient(mongoURL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  await mongoClient.connect();

  const collection = mongoClient.db("whatsapp_api").collection("auth_info_baileys");

  // Use the MongoDB auth state logic
  const { state, saveCreds } = await useMongoDBAuthState(collection);

  const sock = makeWASocket({
    auth: state,
  });

  // Generate and store session ID after connection is established
  const sessionId = generateSessionId();
  await storeSessionId(sessionId, collection); // Store session ID in MongoDB

  // Update the config with the session ID
  config.SESSION_ID = sessionId;

  // Send session ID to the user
  sock.ev.on('messages.upsert', async (messageInfoUpsert) => {
  // Send the session ID to the bot user (sock.user.id)
  const { messages } = messageInfoUpsert;
  for (let message of messages) {
    if (message.type === 'chat') {
      const from = message.key.remoteJid;

      // Send the session ID to the bot user
      if (from === sock.user.id) {
        await sock.sendMessage(from, {
          text: `Your session ID is: ${config.SESSION_ID}`,
        });
      }
    }
  }
});

  // Handle connection updates
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update || {};

    // Handle QR code generation
    if (qr) {
      qrCodeData = await QRCode.toDataURL(qr);
      console.log("QR code updated.");
    }

    // Reconnection logic
    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        connectionLogic();
      }
    }
  });

  sock.ev.on("messages.update", (messageInfo) => {
    console.log(messageInfo);
  });

  sock.ev.on("messages.upsert", (messageInfoUpsert) => {
    console.log(messageInfoUpsert);
  });

  sock.ev.on("creds.update", saveCreds);
}

// Start connection logic
connectionLogic();

// Serve the QR code at the root URL
app.get("/", (req, res) => {
  if (qrCodeData) {
    res.send(`
      <h2>Scan the QR Code below with WhatsApp:</h2>
      <img src="${qrCodeData}" alt="WhatsApp QR Code" />
    `);
  } else {
    res.send("<h2>QR Code not generated yet. Please wait...</h2>");
  }
});

// Start the web server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
