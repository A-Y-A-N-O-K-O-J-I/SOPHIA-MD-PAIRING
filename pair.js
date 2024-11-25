const { v4: uuidv4 } = require('uuid');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState,delay ,makeCacheableSignalKeyStore, Browsers } = require('@whiskeysockets/baileys');
const { Pool } = require('pg');
const fs = require('fs');
const pino = require('pino');
// Set up PostgreSQL connection
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function generatePairingCode(req, res) {
    const sessionID = `SOPHIA_MD-${uuidv4().replace(/-/g, '').toUpperCase()}`;
    console.log(`Generating pairing code for session ID: ${sessionID}`);

    async function initializePairingSession() {
        console.log(`Initializing pairing session for session ID: ${sessionID}`);

        const { state, saveCreds } = await useMultiFileAuthState(`./temp/${sessionID}`);
        console.log(`Loaded authentication state for session: ${sessionID}`);

        try {
            // Create the WebSocket connection with the updated logic
            const P = (await import("pino")).default({ level: "silent" });
            const sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, P),
                },
                logger: P,
                browser: Browsers.windows("Chrome"),
                printQRInTerminal: false,
            });

            sock.ev.on('creds.update', saveCreds);

            if (!sock.authState.creds.registered) {
                await delay(3000);
                let num = req.query.number || '';
                num = num.replace(/[^0-9]/g, ''); // Sanitize the number
                console.log(`Requesting pairing code for number: ${num}`);

                let code = await sock.requestPairingCode(num);
                code = code?.match(/.{1,4}/g)?.join("-") || code; // Format the code
                console.log(`Your Pairing Code: ${code}`);

                if (!res.headersSent) {
                    res.send({ code });
                    console.log("Pairing code sent to client.");
                }

                // Wait for pairing to complete
                console.log("Waiting for 15 seconds after pairing code...");
                await new Promise((resolve) => setTimeout(resolve, 15000));

                // Check for credentials and proceed with storage
                const credsPath = `./temp/${sessionID}/creds.json`;
                if (!fs.existsSync(credsPath)) {
                    console.log('Warning: creds.json file not found. Please pair again.');
                    return;
                }

                console.log('creds.json file exists. Proceeding with storing session data.');
                const credsData = fs.readFileSync(credsPath);
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

                // Cleanup temporary files
                console.log(`Cleaning up temporary session folder: temp/${sessionID}`);
                await fs.promises.rm(`temp/${sessionID}`, { recursive: true, force: true });
                console.log(`Temporary session folder removed for session ID: ${sessionID}`);

                await sock.sendMessage(sock.user.id, { text: `Session created successfully! ID: ${sessionID}` });
                console.log(`Session creation message sent to user: ${sessionID}`);
                await sock.ws.close();
                console.log('WebSocket connection closed.');
            }
        } catch (error) {
            console.error('Error during pairing process:', error);
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
