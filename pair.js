const { v4: uuidv4 } = require('uuid');
const makeWASocket = require('@whiskeysockets/baileys').default;
const {
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    usePairingCode,
    Browsers
} = require('@whiskeysockets/baileys');

const { Pool } = require('pg');
const fs = require('fs');
const pino = require('pino');

// Set up PostgreSQL connection
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Create a pino logger with silent log level to suppress whiskey sockets' logs
const logger = pino({ level: 'silent' });

async function generatePairingCode(req, res) {
    const sessionID = `SOPHIA_MD-${uuidv4().replace(/-/g, '').toUpperCase()}`;
    console.log(`Generating pairing code for session ID: ${sessionID}`);

    async function initializePairingSession() {
        console.log(`Initializing pairing session for session ID: ${sessionID}`);

        const { state, saveCreds } = await useMultiFileAuthState(`./temp/${sessionID}`);
        console.log(`Loaded authentication state for session: ${sessionID}`);

        try {
            console.log(`Creating WebSocket connection...`);
            // Create the WebSocket connection with key caching integrated
            const sock = makeWASocket({
                auth: {
                    creds: state.creds,  // Credentials
                    keys: makeCacheableSignalKeyStore(state.keys, console), // Use the cacheable signal key store
                },
                printQRInTerminal: !usePairingCode,
                browser: Browsers.windows("Chrome"), // Disable terminal QR
                logger: logger,  // Set the logger to suppress whiskey sockets logs
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;
                console.log('Connection update received:', update);

                if (connection === 'open') {
                    console.log("Connection established.");

                    let num = req.query.number || '';
                    num = num.replace(/[^0-9]/g, ''); // Clean the number
                    console.log(`Requesting pairing code for number: ${num}`);

                    try {
                        // Request the pairing code once the connection is confirmed
                        const code = await sock.requestPairingCode(num);
                        console.log(`Pairing code received: ${code}`);

                        if (!res.headersSent) {
                            res.send({ code });
                            console.log("Pairing code sent to client.");
                        }

                        // Wait for 15 seconds after pairing code is linked
                        console.log("Waiting for 15 seconds after pairing code...");
                        await new Promise(resolve => setTimeout(resolve, 15000));

                        // Handle credentials and cleanup
                        const credsPath = `./temp/${sessionID}/creds.json`;

                        if (!fs.existsSync(credsPath)) {
                            console.log('Warning: creds.json file not found. Please pair again.');
                            return; // Exit early and prompt user to pair again
                        } else {
                            console.log('creds.json file exists. Proceeding with storing session data.');

                            const credsData = fs.readFileSync(credsPath);
                            console.log(`creds.json data size: ${credsData.length} bytes`);

                            const base64Data = Buffer.from(credsData).toString('base64');
                            console.log('Credentials converted to base64.');

                            // Store session in PostgreSQL
                            const client = await pool.connect();
                            try {
                                console.log('Inserting session data into PostgreSQL...');
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

                            // Cleanup previous session if exists (remove old temp folder)
                            console.log(`Cleaning up temporary session folder: temp/${sessionID}`);
                            await fs.promises.rm(`temp/${sessionID}`, { recursive: true, force: true });

                            console.log(`Temporary session folder removed for session ID: ${sessionID}`);

                            await sock.sendMessage(sock.user.id, { text: `Session created successfully! ID: ${sessionID}` });
                            console.log(`Session creation message sent to user: ${sessionID}`);
                            await sock.ws.close();
                            console.log('WebSocket connection closed.');
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
    console.log('Starting pairing session...');
    await initializePairingSession();
}

module.exports = { generatePairingCode };
