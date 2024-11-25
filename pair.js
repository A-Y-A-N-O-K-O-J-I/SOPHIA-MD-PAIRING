const { v4: uuidv4 } = require('uuid');
const makeWASocket = require('@whiskeysockets/baileys').default;
const {
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers
} = require('@whiskeysockets/baileys');

const { Pool } = require('pg');
const fs = require('fs');

// Set up PostgreSQL connection
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function generatePairingCode(req, res) {
    const sessionID = `SOPHIA_MD-${uuidv4().replace(/-/g, '').toUpperCase()}`;

    async function initializePairingSession() {
        const { state, saveCreds } = await useMultiFileAuthState(`./temp/${sessionID}`);

        try {
            // Create the WebSocket connection with the key caching integrated
            const sock = makeWASocket({
                auth: {
                    creds: state.creds,  // Credentials
                    keys: makeCacheableSignalKeyStore(state.keys, console), // Use the cacheable signal key store
                },
                printQRInTerminal: false, // Disable terminal QR
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (connection === 'open') {
                    // Clean phone number input to remove non-numeric characters
                    let num = req.query.number || '';
                    num = num.replace(/[^0-9]/g, ''); // Clean the number

                    try {
                        const code = await sock.requestPairingCode(num);

                        if (!res.headersSent) {
                            res.send({ code });
                        }

                        // Wait for 5 seconds after pairing code is linked
                        await new Promise(resolve => setTimeout(resolve, 5000));

                        // Handle credentials and cleanup
                        const credsPath = `./temp/${sessionID}/creds.json`;

if (!fs.existsSync(credsPath)) {
    // If creds.json doesn't exist, log a warning and stop the process
    console.log('Warning: creds.json file not found. Please pair again.');
    // Optionally, you can trigger the pairing process again here if you want
    return; // Exit early and prompt user to pair again
} else {
    // If creds.json exists, proceed with the session storage and cleanup
    console.log('creds.json file exists. Proceeding...');

    const credsData = fs.readFileSync(credsPath);
    const base64Data = Buffer.from(credsData).toString('base64');

    const client = await pool.connect();
    try {
        // Store session in PostgreSQL
        await client.query(
            'INSERT INTO sessions (session_id, base64_creds) VALUES ($1, $2)',
            [sessionID, base64Data]
        );
        console.log(`Session ${sessionID} stored in PostgreSQL.`);
    } catch (dbError) {
        console.error('Error saving to PostgreSQL:', dbError);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Unable to store session in the database, please try again.' });
        }
    } finally {
        client.release();
    }

                            // Cleanup
                            await fs.promises.rm(`temp/${sessionID}`, { recursive: true, force: true });
                            await sock.sendMessage(sock.user.id, { text: `Session created successfully! ID: ${sessionID}` });
                            await sock.ws.close();
                        }
                    } catch (error) {
                        console.error('Error handling pairing code:', error);
                        if (!res.headersSent) {
                            res.status(500).json({ error: 'Pairing failed, please try again later.' });
                        }
                    }
                }

                if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== 401) {
                    console.log('Connection closed, pairing failed, not retrying.');
                    if (!res.headersSent) {
                        res.status(500).json({ error: 'Pairing failed, please try again later.' });
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

    // Start the pairing session
    await initializePairingSession();
}

module.exports = { generatePairingCode };
