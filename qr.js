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
const { Pool } = require('pg');

// Set up PostgreSQL connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'your_database_url', // Use your DATABASE_URL here
    ssl: {
        rejectUnauthorized: false  // This allows self-signed certificates, adjust as needed
    }
});

async function generateQR(req, res) {
    const extraRandom = Math.random().toString(36).substring(2, 12).toUpperCase();
    const sessionID = `SOPHIA_MD-${uuidv4().replace(/-/g, '').toUpperCase()}${extraRandom}`;

    let responseSent = false; // Flag to track if a response has been sent

    async function initializeQRSession() {
        const { state, saveCreds } = await useMultiFileAuthState(`./temp/${sessionID}`);

        try {
            const sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys),
                },
                printQRInTerminal: false, // Disable terminal QR
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr && !responseSent) { // Only send the QR code if the response hasn't been sent yet
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

                if (connection === 'open' && !responseSent) { // Ensure response is sent only once
                    console.log('QR code scanned and session established.');
                    const credsPath = path.join(__dirname, `temp/${sessionID}/creds.json`);
                    if (fs.existsSync(credsPath)) {
                        const credsData = fs.readFileSync(credsPath);
                        const base64Data = Buffer.from(credsData).toString('base64');

                        // Store in PostgreSQL
                        const client = await pool.connect();
                        try {
                            await client.query(
                                'INSERT INTO sessions (session_id, base64_creds, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP)', 
                                [sessionID, base64Data]
                            );
                            console.log("Session stored in database with timestamp.");
                        } catch (dbError) {
                            console.error('Error saving to PostgreSQL:', dbError);
                            if (!responseSent) {
                                res.status(500).json({ error: 'Unable to store session in the database, please try again.' });
                                responseSent = true; // Mark response as sent
                            }
                        } finally {
                            client.release();
                        }
                        const sessionMessage = `${sessionID}`;
                        const sentMsg = await sock.sendMessage(sock.user.id, { text: sessionMessage });
                        console.log("Session ID sent to user.");

                        const extraMessage = `*_SOPHIA MD CONNECTED SUCCESSFULLY_*
______________________________________
╔════◇
║ *『 *SOPHIA MD MADE BY AYANOKOJI』*
║ _You're using the SECOND multifunctional bot to be created from scratch 🗿✨‼️_
╚══════════════════════╝
╔═════◇
 •••』
║❒ *Ytube:*(not yet)
║❒ *Owner:* 𝚫𝐘𝚫𝚴𝚯𝐊𝚯𝐉𝚰 𝐊𝚰𝐘𝚯𝚻𝚫𝐊𝚫
║❒ *Repo:* (not yet)
║❒ *WaChannel:* 
https://whatsapp.com/channel/0029VasFQjXICVfoEId0lq0Q
║❒ 
╚══════════════════════╝ 


_Don't Forget To Give Star To My Repo_`;
                        await sock.sendMessage(sock.user.id, { text: extraMessage }, { quoted: sentMsg });
                    }

                    // Clean up and close connection
                    await delay(10000);
                    await sock.ws.close();

                        // Cleanup
                        await fs.promises.rm(`temp/${sessionID}`, { recursive: true, force: true });
                        
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
