const express = require("express");
const makeWASocket = require("@whiskeysockets/baileys").default;
const { MongoClient } = require("mongodb");
const useMongoDBAuthState = require("./mongoAuthState");
const { DisconnectReason } = require("@whiskeysockets/baileys");
const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");
const config = require("./config");

const app = express();
const port = config.PORT;
const mongoURL = config.MONGODB_URI;

let qrCodeData = "";
let sessionIdSent = false;  // This will ensure the session ID is sent only once

function generateSessionId() {
  return `SOPHIA_MD-${uuidv4().replace(/-/g, "").toUpperCase()}`;
}

async function connectionLogic() {
  const mongoClient = new MongoClient(mongoURL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  await mongoClient.connect();

  const collection = mongoClient.db("whatsapp_api").collection("auth_info_baileys");
  const { state, saveCreds, clearAuthState, getSessionId, storeSessionId, clearSessionId } =
    await useMongoDBAuthState(collection);

  let sessionId = await getSessionId();
  console.log("Retrieved session ID:", sessionId);

  if (!sessionId) {
    console.log("No session ID found. Clearing old credentials...");
    await clearAuthState();
    qrCodeData = "";
  }

  const initiateSocket = () => {
    const sock = makeWASocket({ auth: state });

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update || {};

      if (qr) {
        qrCodeData = await QRCode.toDataURL(qr);
        console.log("QR code updated. Scan to log in.");
      }

      if (connection === "open") {
        console.log("Connection successful. Saving session ID...");
        if (!sessionId) {
          sessionId = generateSessionId();
          await storeSessionId(sessionId);
        }

        const yourNumber = sock.user.id; // Replace with your full JID
        if (!sessionIdSent) {
          try {
            await sock.sendMessage(yourNumber, {
              text: `Your session ID is: ${sessionId}`,
            });
            console.log("Session ID sent to your contact.");
            sessionIdSent = true;  // Prevents sending session ID again
          } catch (error) {
            console.error("Failed to send session ID:", error);
          }
        }
        console.log("Connected to WhatsApp.");
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;

        if (statusCode === DisconnectReason.loggedOut) {
          console.log("Session logged out. Clearing auth state...");
          await clearAuthState();
          await clearSessionId(); // Clear session ID in MongoDB
          connectionLogic();
        } else {
          console.log("Reconnecting...");
          initiateSocket();
        }
      }
    });

    sock.ev.on("creds.update", saveCreds);
  };

  initiateSocket();
}

connectionLogic();

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

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
