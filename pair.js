const { v4: uuidv4 } = require('uuid');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, delay, makeCacheableSignalKeyStore, Browsers } = require('@whiskeysockets/baileys');
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function generatePairingCode(req, res) {
    
    const extraRandom = Math.random().toString(36).substring(2, 22).toUpperCase();
    const sessionID = `SOPHIA_MD-${uuidv4().replace(/-/g, '').toUpperCase()}${extraRandom}`;

    console.log(`Generating pairing code for session ID: ${sessionID}`);

    async function initializePairingSession() {
        console.log(`Initializing pairing session for session ID: ${sessionID}`);

        const { state, saveCreds } = await useMultiFileAuthState(`./temp/${sessionID}`);
        console.log(`Loaded authentication state for session: ${sessionID}`);

        try {
            const P = (await import("pino")).default({ level: "silent" });
            const sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, P),
                },
                logger: P,
                printQRInTerminal: false,
            });

            sock.ev.on('creds.update', saveCreds);

            let isPaired = false;

            sock.ev.on('connection.update', (update) => {
                const { connection } = update;
                if (connection === 'open') {
                    isPaired = true;
                }
            });

            if (!sock.authState.creds.registered) {
                await delay(3000);

                let num = req.query.number || '';
                num = num.replace(/[^0-9]/g, '');
                console.log(`Requesting pairing code for number: ${num}`);

                let code = await sock.requestPairingCode(num);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log(`Your Pairing Code: ${code}`);

                if (!res.headersSent) {
                    res.send({ code });
                    console.log("Pairing code sent to client.");
                }

                console.log("Waiting for pairing to complete...");
                const timeout = 40000; // 30 seconds timeout
                const startTime = Date.now();

                while (!isPaired && Date.now() - startTime < timeout) {
                    await delay(1000);
                }

                if (!isPaired) {
                    console.log('Pairing process did not complete within the timeout period.');
                    if (!res.headersSent) {
                        res.status(408).json({ error: 'Pairing process timed out. Please try again.' });
                    }
                    return;
                }

                // ... (rest of the code for storing credentials and cleaning up)
            }
        } catch (error) {
            console.error('Error during pairing process:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Service Unavailable' });
            }
        }
    }

    await initializePairingSession();
}

module.exports = { generatePairingCode };
