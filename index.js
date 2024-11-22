const express = require("express");
const makeWASocket = require("@whiskeysockets/baileys").default;
const { MongoClient } = require("mongodb");
const useMongoDBAuthState = require("./mongoAuthState");
const { DisconnectReason } = require("@whiskeysockets/baileys");
const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");
const config = require("./config");

// Set up Express for serving the QR code
const app = express();
const port = config.PORT; // Use the port from config.js
const mongoURL = config.MONGODB_URI; // Use MongoDB URI from config.js

// Variable to hold QR code data
let qrCodeData = "";

// Function to generate a unique session ID
function generateSessionId() {
  return `SOPHIA_MD-${uuidv4().replace(/-/g, "").toUpperCase()}`;
}

// Function to store session ID in MongoDB
async function storeSessionId(sessionId, collection) {
  const sessionData = { _id: "sessionId", sessionId, createdAt: new Date() };
  await collection.updateOne({ _id: "sessionId" }, { $set: sessionData }, { upsert: true });
  console.log(`Session ID stored: ${sessionId}`);
}

// Function to delete the current session ID from MongoDB
async function clearSessionId(collection) {
  await collection.deleteOne({ _id: "sessionId" });
  console.log("Session ID cleared from MongoDB.");
}

// MongoDB connection logic
async function connectionLogic() {
  const mongoClient = new MongoClient(mongoURL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  await mongoClient.connect();

  const collection = mongoClient.db("whatsapp_api").collection("auth_info_baileys");
  const { state, saveCreds, clearAuthState, getSessionId } = await useMongoDBAuthState(collection);

  // Retrieve existing session ID from MongoDB
  let sessionId = await getSessionId();
  console.log("Retrieved session ID:", sessionId);

  // If session ID is null or auth state is invalid, clear auth state and prompt QR login
  if (!sessionId) {
    console.log("No session ID found. Clearing old credentials...");
    await clearAuthState(); // Clear auth state from MongoDB
    qrCodeData = ""; // Reset QR code
  }

  const initiateSocket = () => {
    const sock = makeWASocket({ auth: state });

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update || {};

      // Handle QR code generation
      if (qr) {
        qrCodeData = await QRCode.toDataURL(qr);
        console.log("QR code updated. Scan to log in.");
      }

      if (connection === "open") {
        console.log("Connection successful. Saving session ID...");
        if (!sessionId) {
          // Generate and store session ID after successful login
          sessionId = generateSessionId();
          await storeSessionId(sessionId, collection);
        }
        console.log("Connected to WhatsApp.");
      }

      // Handle disconnections and logout
      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;

        if (statusCode === DisconnectReason.loggedOut) {
          console.log("Session logged out. Clearing auth state...");
          await clearAuthState(); // Clear auth state from MongoDB
          connectionLogic(); // Restart connection logic to prompt QR login
        } else if (statusCode !== DisconnectReason.loggedOut) {
          console.log("Reconnecting...");
          initiateSocket(); // Reinitialize the socket
        }
      }
    });

    sock.ev.on("creds.update", saveCreds);
  };

  // Start the socket connection
  initiateSocket();
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
