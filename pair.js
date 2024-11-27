const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const fsPromises = require('fs').promises;
const pino = require("pino");
const { Pool } = require('pg');
const express = require('express');
const router = express.Router();
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
} = require('@whiskeysockets/baileys');

// PostgreSQL connection pool setup
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Helper function to remove files
async function removeFile(filePath) {
    if (fs.existsSync(filePath)) {
        try {
            await fsPromises.rm(filePath, { recursive: true, force: true });
            console.log(`Successfully removed file: ${filePath}`);
        } catch (error) {
            console.error(`Error removing file: ${filePath}`, error);
        }
    }
}

// Main pairing code generation function
router.get('/pair', async (req, res) => {
    console.log("Generating pairing code...");
    const extraRandom = Math.random().toString(36).substring(2, 22).toUpperCase();
    const sessionID = `SOPHIA_MD-${uuidv4().replace(/-/g, '').toUpperCase()}${extraRandom}`;
    console.log(`Generated session ID: ${sessionID}`);

    let num = req.query.number;
    let retryCount = 0;
    const maxRetries = 5;

    async function initializePairingSession() {
        const { state, saveCreds } = await useMultiFileAuthState(`./temp/${sessionID}`);
        console.log("Authentication state initialized.");

        try {
            const sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
                },
                logger: pino({ level: "silent" }),
                printQRInTerminal: false,
                browser: Browsers.windows('Chrome'),
            });

            if (!sock.authState.creds.registered) {
                console.log("Requesting pairing code...");
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                const code = await sock.requestPairingCode(num);
                if (!res.headersSent) res.send({ code });
            }

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === "open") {
                    console.log("Connection established.");
                    await delay(5000);

                    // Read and encode credentials
                    const credsPath = `./temp/${sessionID}/creds.json`;
                    if (fs.existsSync(credsPath)) {
                        const credsData = fs.readFileSync(credsPath);
                        const base64Data = Buffer.from(credsData).toString('base64');
                        console.log("Credentials encoded to Base64.");

                        // Store session data in PostgreSQL
                        try {
                            await pool.query('INSERT INTO sessions (session_id, base64_creds) VALUES ($1, $2)', [sessionID, base64Data]);
                            console.log("Session stored in database.");
                        } catch (error) {
                            console.error("Database error:", error);
                        }

                        // Send session ID and additional info
                        const sessionMessage = `SESSION_ID: ${sessionID}`;
                        const sentMsg = await sock.sendMessage(sock.user.id, { text: sessionMessage });
                        console.log("Session ID sent to user.");

                        const extraMessage = `ENJOY SOPHIA_MD WHATSAPP BOT ✅ AND JOIN THE CHANNEL...`;
                        await sock.sendMessage(sock.user.id, { text: extraMessage }, { quoted: sentMsg });
                    }

                    // Clean up and close connection
                    await delay(1000);
                    await sock.ws.close();
                    await removeFile(`./temp/${sessionID}`);
                } else if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
                    if (retryCount < maxRetries) {
                        retryCount++;
                        console.log(`Retrying connection (${retryCount}/${maxRetries})...`);
                        await delay(10000);
                        initializePairingSession();
                    } else {
                        console.error("Max retries reached. Aborting.");
                        if (!res.headersSent) res.send({ code: "Service Unavailable" });
                    }
                }
            });
        } catch (error) {
            console.error("Error during pairing process:", error);
            if (!res.headersSent) res.send({ code: "Service Unavailable" });
            await removeFile(`./temp/${sessionID}`);
        }
    }

    await initializePairingSession();
});

module.exports = router;
