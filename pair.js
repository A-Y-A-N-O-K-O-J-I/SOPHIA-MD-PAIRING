const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const pino = require("pino");
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    makeCacheableSignalKeyStore 
} = require('maher-zubair-baileys');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

async function generatePairingCode(req, res) {
    const extraRandom = Math.random().toString(36).substring(2, 22).toUpperCase();
    const sessionID = `SOPHIA_MD-${uuidv4().replace(/-/g, '').toUpperCase()}${extraRandom}`;
    let num = req.query.number;

    async function initializePairingSession() {
        const { state, saveCreds } = await useMultiFileAuthState(`./temp/${sessionID}`);

        try {
            const sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
                },
                logger: pino({ level: "fatal" }),
                printQRInTerminal: false,
                browser: ["Chrome (Linux)", "", ""]
            });

            if (!sock.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                const code = await sock.requestPairingCode(num);

                if (!res.headersSent) {
                    res.send({ code });
                    console.log(`Pairing code sent: ${code}`);
                }
            }

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === "open") {
                    await delay(5000);

                    // Store session data in PostgreSQL (before deleting temp files)
                    const credsPath = `./temp/${sessionID}/creds.json`;
                    if (fs.existsSync(credsPath)) {
                        const credsData = fs.readFileSync(credsPath);
                        const base64Data = Buffer.from(credsData).toString('base64');

                        try {
                            // Insert into the PostgreSQL database
                            await pool.query('INSERT INTO sessions (session_id, base64_creds) VALUES ($1, $2)', [sessionID, base64Data]);
                            console.log(`Session credentials stored for session ID: ${sessionID}`);
                        } catch (dbError) {
                            console.error("Database error:", dbError);
                        }

                        // Only remove temporary files after storing the credentials in the database
                        removeFile(`./temp/${sessionID}`);
                        console.log(`Temporary files deleted for session ID: ${sessionID}`);
                    }

                    // Notify the user with session ID
                    const sessionMessage = `SESSION_ID: ${sessionID}`;
                    const extraMessage = `ENJOY SOPHIA_MD WHATSAPP BOT ✅  AND JOIN THE CHANNEL
                    We do bot giveaway.🗿 Panel giveaway🖥️💻
Big bot file giveaway🗣️⚡
Free coding tutorial videos👨‍💻
And so much more first giveaway at 100 followers🥳🥳

https://whatsapp.com/channel/0029VasFQjXICVfoEId0lq0Q`
                    await sock.sendMessage(sock.user.id, { text: sessionMessage });
                    await sock.sendMessage(sock.user.id, { text:extraMessage}, {quoted:sessionMessage});

                    await delay(100);
                    await sock.ws.close();
                } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode !== 401) {
                    await delay(10000);
                    initializePairingSession();
                }
            });
        } catch (error) {
            console.error('Error during pairing process:', error);
            removeFile(`./temp/${sessionID}`);
            if (!res.headersSent) {
                res.send({ code: "Service Unavailable" });
            }
        }
    }

    await initializePairingSession();
}

module.exports = { generatePairingCode };
