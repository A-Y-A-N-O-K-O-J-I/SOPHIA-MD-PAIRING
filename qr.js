const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const makeWASocket = require('@whiskeysockets/baileys').default;
const {
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    delay,
    Browsers
} = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const pino = require('pino'); 

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

// 1. Upload File Helper
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


async function generateQR(req, res) {
    const extraRandom = Math.random().toString(36).substring(2, 12).toUpperCase();
    const sessionID = `SOPHIA_MD-${uuidv4().replace(/-/g, '').toUpperCase()}${extraRandom}`;

    let responseSent = false;

    async function initializeQRSession() {
        const tempPath = `./temp/${sessionID}`;

if (!fs.existsSync('./temp')) {
    fs.mkdirSync('./temp', { recursive: true });
}

const { state, saveCreds } = await useMultiFileAuthState(tempPath);
console.log("Authentication state initialized.")
        try {
            const sock = makeWASocket({
    auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
    },
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: Browsers.windows('Safari'),
    syncFullHistory: true,
    generateHighQualityLinkPreview: true, 
});

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                // Send QR code if available
                if (qr && !responseSent) {
                    try {
                        console.log(`Serving QR code for session: ${sessionID}`);
                        const qrBuffer = await QRCode.toBuffer(qr);
                        res.writeHead(200, { 'Content-Type': 'image/png' });
                        res.end(qrBuffer);
                        responseSent = true; // Mark response as sent
                    } catch (error) {
                        console.error('Error sending QR code:', error);
                    }
                }

                if (connection === 'open') {
                    console.log('QR code scanned and session established.');
                    const credsPath = path.join(__dirname, `temp/${sessionID}/creds.json`);
const dropboxPath = `/Sophia-auth/${sessionID}.json`;
                    if (fs.existsSync(credsPath)) {
const dropboxSessionID = await uploadFile(credsPath,dropboxPath)
                      
                            if (!responseSent) {
                                res.status(500).json({ error: 'Unable to store session in the database, please try again.' });
                                responseSent = true; // Mark response as sent
                            }
                       

                        // Send session ID and additional messages
                        const sessionMessage = `${dropboxSessionID}`;
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

                        // Clean up temporary session data
                        await delay(10000);
                        await sock.ws.close();
                        await removeFile(`temp/${sessionID}`)
                    } else {
                        console.error('cred.json not found!');
                        if (!responseSent) {
                            res.status(500).json({ error: 'Session credentials not found, please try again later.' });
                            responseSent = true; // Mark response as sent
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error initializing session:', error);
            if (!responseSent) {
                res.status(500).json({ error: 'Service Unavailable' });
                responseSent = true; // Mark response as sent
            }
        }
    }

    // Start the QR session
    await initializeQRSession();
}

module.exports = { generateQR };
