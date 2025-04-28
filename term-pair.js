const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const fsPromises = require('fs').promises;
const pino = require("pino");
const archiver = require('archiver')
require('dotenv').config();
const express = require('express');
const { exec } = require('child_process');
const router = express.Router();
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
} = require('@whiskeysockets/baileys');
const axios = require('axios');
const path = require("path");
const outputZip = './temp/auth.zip'
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const refreshToken = process.env.REFRESH_TOKEN;

async function refreshAccessToken() {
    try {
        const response = await axios.post('https://api.dropboxapi.com/oauth2/token', null, {
            params: {
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: clientId,
                client_secret: clientSecret,
            },
        });

        const newAccessToken = response.data.access_token;
        return newAccessToken; // Return the new access token
    } catch (error) {
        console.error('Error refreshing access token:', error.response?.data || error.message);
        throw error;
    }
}


async function zipFolderWithRetry(sourceFolder, outputZip, retries = 3) {
    const tempZip = `${outputZip}.part`;

    return new Promise((resolve, reject) => {
        let attempt = 0; // Track retries

        function cleanSessionFiles() {
            const files = fs.readdirSync(sourceFolder);
            files.forEach(file => {
                if (file.includes("session")) {
                    const filePath = path.join(sourceFolder, file);
                    try {
                        fs.unlinkSync(filePath);
                        console.log(`Deleted session file: ${file}`);
                    } catch (err) {
                        console.error(`Failed to delete ${file}: ${err.message}`);
                    }
                }
            });
        }

        function attemptZip() {
            cleanSessionFiles(); // Remove session files before zipping

            const output = fs.createWriteStream(tempZip);
            const archive = archiver('zip', { zlib: { level: 9 } });

            archive.pipe(output);
            archive.directory(sourceFolder, false);
            archive.finalize();

            output.on('close', () => {
                fs.renameSync(tempZip, outputZip);
                console.log(`Zipping done: ${archive.pointer()} bytes`);
                resolve();
            });

            output.on('error', (err) => {
                console.error(`Error in zipping: ${err.message}`);
                if (attempt < retries) {
                    console.log(`Retrying... (${++attempt}/${retries})`);
                    attemptZip(); // Try again
                } else {
                    reject(new Error("Failed after multiple retries"));
                }
            });
        }

        attemptZip(); // Start first attempt
    });
}

async function uploadFile(localFilePath, dropboxPath) {
    try {
        const url = 'https://content.dropboxapi.com/2/files/upload';
        const fileContent = fs.readFileSync(localFilePath); // Read the file content
        const accessToken = await refreshAccessToken(); // Fetch the updated access token

        const response = await axios.post(url, fileContent, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Dropbox-API-Arg': JSON.stringify({
                    path: dropboxPath, // Path in Dropbox (e.g., '/folder/file.txt')
                    mode: 'add',
                    autorename: true,
                    mute: false,
                }),
                'Content-Type': 'application/octet-stream',
            },
        });

        const result = response.data;
        const session = `sophia_md~${result.rev}`;
        console.log('File uploaded successfully:', result);
        return session;
    } catch (error) {
        console.error('Error uploading file:', error.response?.data || error.message);
    }
}


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
        const dropBoxtempPath = `/temp/${sessionID}`;

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
                browser: Browsers.macOS('Safari'),
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
                
    // Extract the sender's remoteJid
 

});
const dropboxPath = `/SOPHIA-MD/${sessionID}.zip`;

            sock.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === "open") {
                    console.log("Connection established.");
                    await delay(10000)

                    // Read and encode credentials
                    const credsPath = `./temp/${sessionID}/creds.json`;
                  async function waitForAppStateKey(credsPath, maxWaitTime = 15000) {
    let elapsedTime = 0;
    const interval = 1000; // Check every 1 second

    while (elapsedTime < maxWaitTime) {
        if (fs.existsSync(credsPath)) {
            const credsData = JSON.parse(fs.readFileSync(credsPath, "utf8"));
            if (credsData?.myAppStateKeyId) {
                return true; // Found the key
            }
        }
        await delay(interval);
        elapsedTime += interval;
    }
    return false; // Key never appeared
}

if (fs.existsSync(credsPath)) {
    await delay(5000); // Initial wait

    if (await waitForAppStateKey(credsPath)) { // Wait until the key exists
        await zipFolderWithRetry(tempPath, outputZip);
        const session = await uploadFile(outputZip, dropboxPath);

        console.log("Credentials saved to dropBox ⬆️");
        if (session) {
            const sessionMessage = `${session}`;
            const sentMsg = await sock.sendMessage(sock.user.id, { text: sessionMessage });

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
        }

        await delay(5000);
        await removeFile(`./temp/`);
        await sock.ws.close();
    } else {
        console.log("Timeout: myAppStateKeyId never appeared. Skipping upload.");

        const errorMessage = `⚠️ *SESSION AUTHENTICATION FAILED* ⚠️

It looks like there was an issue while trying to save your session. The required authentication key (*myAppStateKeyId*) wasn't found, meaning the session might not be valid.

🔹 This could be caused by:
  - The session being saved *too early* before authentication finished.
  - An issue with the WhatsApp Web connection.
  - Baileys not generating the necessary keys in time.

🔄 *What to do next?*
- Please relink your WhatsApp by scanning the QR code again.
- Ensure your network connection is stable before trying again.
- If the issue persists, restart the bot and try again.

If you need help, you can check the logs or contact support.`;

        await sock.sendMessage(sock.user.id, { text: errorMessage });
    }
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
            await removeFile(`./temp/`);
        }
    }

    await initializePairingSession();
});

module.exports = router;
