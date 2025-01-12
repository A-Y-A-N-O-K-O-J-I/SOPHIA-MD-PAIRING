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

                if (qr) {
                    try {
                        console.log(`Serving QR code for session: ${sessionID}`);
                        const qrBuffer = await QRCode.toBuffer(qr);
                        res.writeHead(200, { 'Content-Type': 'image/png' });
                        res.end(qrBuffer);
                    } catch (error) {
                        console.error('Error sending QR code:', error);
                    }
                }

                if (connection === 'open') {
                    console.log('QR code scanned and session established.');
                    const credsPath = path.join(__dirname, `temp/${sessionID}/creds.json`);
                    if (fs.existsSync(credsPath)) {
                        const credsData = fs.readFileSync(credsPath);
                        const base64Data = Buffer.from(credsData).toString('base64');

                        // Store in PostgreSQL
                        const client = await pool.connect();
                        try {
                            // Inside the function where session is stored in the database (e.g., inside pair.js or qr.js)
await client.query(
  'INSERT INTO sessions (session_id, base64_creds, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP)', 
  [sessionID, base64Data]
);
console.log("Session stored in database with timestamp.");
                        } catch (dbError) {
                            console.error('Error saving to PostgreSQL:', dbError);
                            res.status(500).json({ error: 'Unable to store session in the database, please try again.' });
                        } finally {
                            client.release();
                        }

                        // Cleanup
                        await fs.promises.rm(`temp/${sessionID}`, { recursive: true, force: true });
                        await sock.ws.close();
                    } else {
                        console.error('cred.json not found!');
                        res.status(500).json({ error: 'Session credentials not found, please try again later.' });
                    }
                }
            });
        } catch (error) {
            console.error('Error initializing session:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Service Unavailable' });
            }
        }
    }

    // Start the QR session
    await initializeQRSession();
}

module.exports = { generateQR };
