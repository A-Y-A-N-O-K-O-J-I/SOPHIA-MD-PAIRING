const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const pino = require("pino");
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    makeCacheableSignalKeyStore 
} = require('@whiskeysockets/baileys')

const { Pool } = require('pg');

// PostgreSQL connection pool setup
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Helper function to remove files safely
function removeFile(FilePath) {
    console.log(`Attempting to remove file: ${FilePath}`);
    if (fs.existsSync(FilePath)) {
        fs.rmSync(FilePath, { recursive: true, force: true });
        console.log(`Successfully removed file: ${FilePath}`);
    } else {
        console.log(`File not found: ${FilePath}`);
    }
}

// Function to handle pairing code generation and session initialization
async function generatePairingCode(req, res) {
    console.log("Starting to generate pairing code...");

    const extraRandom = Math.random().toString(36).substring(2, 22).toUpperCase();
    const sessionID = `SOPHIA_MD-${uuidv4().replace(/-/g, '').toUpperCase()}${extraRandom}`;
    console.log(`Generated session ID: ${sessionID}`);

    let num = req.query.number;

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
                logger: pino({ level: "debug" }),
                printQRInTerminal: false,
                browser: ["Chrome (Linux)", "", ""]
            });

            if (!sock.authState.creds.registered) {
                console.log("Credentials not registered, requesting pairing code...");
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
                        console.log("Converted credentials to base64 format.");

                        try {
                            // Insert session credentials into PostgreSQL
                            await pool.query('INSERT INTO sessions (session_id, base64_creds) VALUES ($1, $2)', [sessionID, base64Data]);
                            console.log(`Session credentials successfully stored for session ID: ${sessionID}`);
                        } catch (dbError) {
                            console.error("Error storing session credentials in database:", dbError);
                        }

                        // Clean up temporary files after storing credentials
                        removeFile(`./temp/${sessionID}`);
                    } else {
                        console.log(`Credentials file not found at: ${credsPath}`);
                    }

                    // Send a session message to the user
                    const sessionMessage = `SESSION_ID: ${sessionID}`;
                    const extraMessage = `ENJOY SOPHIA_MD WHATSAPP BOT ✅ AND JOIN THE CHANNEL
We do bot giveaway.🗿 Panel giveaway🖥️💻
Big bot file giveaway🗣️⚡
Free coding tutorial videos👨‍💻
And so much more. First giveaway at 100 followers🥳🥳
https://whatsapp.com/channel/0029VasFQjXICVfoEId0lq0Q`;

                    const move = await sock.sendMessage(sock.user.id, { text: sessionMessage });
                    console.log(`Session ID message sent: ${sessionMessage}`);
                    await sock.sendMessage(sock.user.id, { text: extraMessage }, { quoted: move });
                    console.log("Additional message sent to user.");

                    // Close the WebSocket connection after the message
                    await delay(100);
                    await sock.ws.close();
                    console.log("WebSocket connection closed.");
                } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode !== 401) {
                    console.log("Connection closed unexpectedly, retrying pairing...");
                    await delay(10000);
                    initializePairingSession(); // Re-run the pairing session
                }
            });
        } catch (error) {
            console.error('Error during pairing process:', error);
            removeFile(`./temp/${sessionID}`); // Clean up if any error occurs
            if (!res.headersSent) {
                res.send({ code: "Service Unavailable" }); // Inform the user if service fails
            }
        }
    }

    // Start the pairing session
    await initializePairingSession();
    console.log("Pairing process initiated.");
}

module.exports = { generatePairingCode };
