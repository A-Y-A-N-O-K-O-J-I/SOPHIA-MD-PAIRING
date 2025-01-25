const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const fsPromises = require('fs').promises;
const pino = require("pino");
const { Pool } = require('pg');
const express = require('express');
const { exec } = require('child_process');
const router = express.Router();
const archiver = require('archiver');
const base64 = require('base64-url');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
} = require('@whiskeysockets/baileys');
const { djxndjjdkddnd } = require('./hm');

// PostgreSQL connection pool setup
const pool = new Pool({
    connectionString: djxndjjdkddnd , // Use your DATABASE_URL here
    ssl: {
        rejectUnauthorized: false  // This allows self-signed certificates, adjust as needed
    }
});
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

// Helper function to zip the Auth folder and convert to base64
async function zipAndEncodeAuth(sessionID) {
    const output = fs.createWriteStream(`./temp/${sessionID}/auth.zip`);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
        output.on('close', function() {
            console.log("Auth folder successfully zipped!");
            // Now, read the zip file and convert it to base64
            const zipFileBuffer = fs.readFileSync(`./temp/${sessionID}/auth.zip`);
            const base64Zip = base64.encode(zipFileBuffer);
            console.log("Base 64 zip file created");
            resolve(base64Zip);
        });

        archive.pipe(output);
        archive.directory(`./temp/${sessionID}`, false); // Adjust folder path as necessary
        archive.finalize();
    });
}

// Main pairing code generation function
router.get('/', async (req, res) => {
    console.log("Generating pairing code...");
    const extraRandom = Math.random().toString(36).substring(2, 22).toUpperCase();
    const sessionID = `SOPHIA_MD-${uuidv4().replace(/-/g, '').toUpperCase()}${extraRandom}`;
    console.log(`Generated session ID: ${sessionID}`);

    let num = req.query.number;
    let retryCount = 0;
    const maxRetries = 1;

    async function initializePairingSession() {
        const tempPath = `./temp/${sessionID}`;

        if (!fs.existsSync('./temp')) {
            fs.mkdirSync('./temp', { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(tempPath);
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
                syncFullHistory: true,
                generateHighQualityLinkPreview: true,
                shouldSyncHistoryMessage: (msg) => true
            });

            if (!sock.authState.creds.registered) {
                console.log("Requesting pairing code...");
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                const code = await sock.requestPairingCode(num);
                if (!res.headersSent) res.send({ code });
            }
            sock.ev.on('creds.update', saveCreds);
            sock.ev.on('messages.upsert', async (messageInfo) => {
   const message = messageInfo.messages[0];
    if (!message?.message) return;

    console.log("Received message:", JSON.stringify(message, null, 2));
    // Extract the sender's remoteJid
 

})

            sock.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === "open") {
                    console.log("Connection established.");
                    await delay(5000);

                    // Read and encode credentials
                    const credsPath = `./temp/${sessionID}/creds.json`;
                    if (fs.existsSync(credsPath)) {
                      await delay(2000);
                      const base64Zip = await zipAndEncodeAuth(sessionID);
                        console.log("Credentials encoded to Base64.");

                        // Store session data in PostgreSQL
                        try {
                            // Inside the function where session is stored in the database (e.g., inside pair.js or qr.js)
                            await pool.query(
                                'INSERT INTO sessions (session_id, base64_creds, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP)', 
                                [sessionID, base64Zip]
                            );
                            console.log("Session stored in database with timestamp.");
                        } catch (error) {
                            console.error("Database error:", error);
                        }

                        // Send session ID and additional info
                        const sessionMessage = `${sessionID}`;

                        const sentMsg = await sock.sendMessage(sock.user.id, { text: sessionMessage });
                        console.log("Session ID sent to user.");

                        const extraMessage = `*_SOPHIA MD CONNECTED SUCCESSFULLY_*
______________________________________
╔════◇
║ *『 *SOPHIA MD MADE BY AYANOKOJI』*
║ _You're using the FIRST multifunctional bot to be created from scratch with phone only 🗿✨‼️_
╚══════════════════════╝
╔═════◇
 •••』
║❒ *Ytube:*(not yet)
║❒ *Owner:* 𝚫𝐘𝚫𝚴𝚯𝐊𝚯𝐉𝚰 𝐊𝚰𝐄𝚯𝚻𝚫𝐊𝚫
║❒ *Repo:* https://github.com/A-Y-A-N-O-K-O-J-I/SOPHIA-MD
║❒ *WaChannel:* 
https://whatsapp.com/channel/0029VasFQjXICVfoEId0lq0Q
║❒ 
╚══════════════════════╝ 


_Don't Forget To Give Star To My Repo_`;
                        await sock.sendMessage(sock.user.id, { text: extraMessage }, { quoted: sentMsg });
                    await delay(10000)
                        await sock.ws.close()
                    }

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
