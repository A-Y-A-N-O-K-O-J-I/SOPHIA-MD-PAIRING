const express = require('express');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { MongoClient } = require('mongodb');
const useMongoDBAuthState = require('./mongoAuthState');
const { DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');

// Set up Express for serving the QR code
const app = express();
const port = process.env.PORT || 3000;
const mongoURL = "mongodb+srv://Saif:Arhaan123@cluster0.mj6hd.mongodb.net";

// Variable to hold QR code data
let qrCodeData = '';

async function connectionLogic() {
    const mongoClient = new MongoClient(mongoURL, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });
    await mongoClient.connect();

    const collection = mongoClient
        .db("whatsapp_api")
        .collection("auth_info_baileys");
    const { state, saveCreds } = await useMongoDBAuthState(collection);

    const sock = makeWASocket({
        // Provide additional config here
        auth: state,
    });

    // Handle connection updates
    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update || {};

        // Handle QR code generation
        if (qr) {
            qrCodeData = await QRCode.toDataURL(qr); // Convert QR to data URL for web display
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
