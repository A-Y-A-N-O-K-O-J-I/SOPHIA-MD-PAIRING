const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const pino = require("pino");
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    Browsers,
    makeCacheableSignalKeyStore 
} = require('@whiskeysockets/baileys');

const { Pool } = require('pg');

// PostgreSQL connection pool setup
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Helper function to remove files safely
function removeFile(filePath) {
    console.log(`Attempting to remove file: ${filePath}`);
    if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { recursive: true, force: true });
        console.log(`Successfully removed file: ${filePath}`);
    } else {
        console.log(`File not found: ${filePath}`);
    }
}

// Function to handle pairing code generation and session initialization
async function generatePairingCode(req, res) {
    console.log("Starting to generate pairing code...");

    const extraRandom = Math.random().toString(36).substring(2, 22).toUpperCase();
    const sessionID = `SOPHIA_MD-${uuidv4().replace(/-/g, '').toUpperCase()}${extraRandom}`;
    console.log(`Generated session ID: ${sessionID}`);

    let num = req.query.number;
    let retryCount = 0;
    const maxRetries = 5; // Maximum retries allowed for the pairing process

    async function initializePairingSession() {
        console.log("Initializing pairing session...");

        // Set up authentication state for session
        const { state, saveCreds } = await useMultiFileAuthState(`./temp/${sessionID}`);
        console.log("Successfully loaded authentication state.");

        try {
            const sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
                },
                logger: pino({ level: "silent" }),
                printQRInTerminal: false,
                browser: Browsers.windows('Safari'),
            });

            if (!sock.authState.creds.registered) {
                console.log("Credentials not registered, requesting pairing code now...");
                await delay(1500);
                num = num.replace(/[^0-9]/g, ''); // Clean up the phone number
                const code = await sock.requestPairingCode(num); // Request pairing code

                if (!res.headersSent) {
                    res.send({ code });
                    console.log(`Pairing code sent: ${code}`);
                }
            }

            // Save credentials after pairing
            sock.ev.on('creds.update', saveCreds);
            console.log("Credentials will be saved on update.");

            sock.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === "open") {
                    console.log("Connection established successfully.");
                    await delay(5000); // Wait for connection to be fully established

                    // Store session data in PostgreSQL before deleting temp files
                    const credsPath = `./temp/${sessionID}/creds.json`;
                    if (fs.existsSync(credsPath)) {
                        console.log(`Found credentials file at: ${credsPath}`);

                        const credsData = fs.readFileSync(credsPath);
                        const base64Data = Buffer.from(credsData).toString('base64');
                        console.log("Converted credentials to Base64 format.");

                        try {
                            // Insert session credentials into PostgreSQL
                            await pool.query('INSERT INTO sessions (session_id, base64_creds) VALUES ($1, $2)', [sessionID, base64Data]);
                            console.log(`Session credentials successfully stored for session ID: ${sessionID}`);
                        } catch (dbError) {
                            console.error("Error storing session credentials in database:", dbError);
                        }

                        // Send a session message to the user
                        const sessionMessage = `SESSION_ID: ${sessionID}`;
                        const move = await sock.sendMessage(sock.user.id, { text: sessionMessage });
                        console.log(`Session ID message sent: ${sessionMessage}`);
                        
                        const extraMessage = `ENJOY SOPHIA_MD WHATSAPP BOT ✅ AND JOIN THE CHANNEL
We do bot giveaway.🗿 Panel giveaway🖥️💻
Big bot file giveaway🗣️⚡
Free coding tutorial videos👨‍💻
And so much more. giveaway every +100 followers🥳🥳
https://whatsapp.com/channel/0029VasFQjXICVfoEId0lq0Q`;

                        await sock.sendMessage(sock.user.id, { text: extraMessage });
                        console.log("Additional message sent to user.");

                        // Close the WebSocket connection after the message
                        await delay(1000);
                        await sock.ws.close();
                        console.log("WebSocket connection closed.");
                    } else {
                        console.log(`Credentials file not found at: ${credsPath}`);
                    }
                } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode !== 401) {
                    if (retryCount < maxRetries) {
                        retryCount++;
                        console.log(`Connection closed unexpectedly. Retrying (${retryCount}/${maxRetries})...`);
                        await delay(10000);
                        initializePairingSession(); // Re-run the pairing session
                    } else {
                        console.error("Max retries reached. Aborting pairing process.");
                        if (!res.headersSent) {
                            res.send({ code: "Service Unavailable - Max Retries Exceeded" }); // Inform the user of failure
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error during pairing process:', error);
            if (!res.headersSent) {
                res.send({ code: "Service Unavailable" }); // Inform the user if service fails
            }
        }
    }

    // Start the pairing session
    await initializePairingSession();
    console.log("Pairing process initiated.");

    // Clean up by removing temp files after the session is done
    removeFile(`./temp/${sessionID}`);
    console.log("Temporary files removed successfully.");
}

module.exports = { generatePairingCode };
