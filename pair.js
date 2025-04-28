const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const fsPromises = require('fs').promises;
const pino = require("pino");
const archiver = require('archiver');
require('dotenv').config();
const express = require('express');
const { exec } = require('child_process');
const router = express.Router();
const { useSQLiteAuthState } = require("./auth");
const { migrateSessions } = require("./migrate");
const {
    default: makeWASocket,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
} = require('@whiskeysockets/baileys');
const axios = require('axios');
const path = require("path");

const credsPath = "./sessions.db";

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

router.get('/', async (req, res) => {
    console.log("Generating pairing code...");
    const extraRandom = Math.random().toString(36).substring(2, 22).toUpperCase();
    const sessionID = `SOPHIA_MD-${uuidv4().replace(/-/g, '').toUpperCase()}${extraRandom}`;
    console.log(`Generated session ID: ${sessionID}`);

    let num = req.query.number;
    let retryCount = 0;
    const maxRetries = 1;

    async function initializePairingSession() {
        const { state, saveState } = await useSQLiteAuthState(sessionID);
        console.log("Authentication state initialized.");

        const sock = makeWASocket({
            auth: state,
            logger: pino({ level: "silent" }),
            printQRInTerminal: false,
            browser: Browsers.macOS('Safari'),
            syncFullHistory: true,
            generateHighQualityLinkPreview: true,
        });

        if (!sock.authState.creds.registered) {
            console.log("Requesting pairing code...");
            await delay(1500);
            num = num.replace(/[^0-9]/g, '');
            const code = await sock.requestPairingCode(num);
            if (!res.headersSent) res.send({ code });
        }

        sock.ev.on('creds.update', saveState);

        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;
            try {
                if (connection === "open") {
                    console.log("Connection established.");
                    await delay(10000);
                    await migrateSessions();
                    
                    if (fs.existsSync(credsPath)) {
                        await delay(5000);
                        console.log("Credentials saved to postgreSQL");
                        const sessionMessage = `${sessionID}`;
                        const sentMsg = await sock.sendMessage(sock.user.id, { text: sessionMessage });

                       const extraMessage = `
                       ╔══════════════════════════════════╗
                          『 *CONNECTED TO SOPHIA-MD SUCCESSFULLY* 』
                       ╚══════════════════════════════════╝
                       
                       ✅ *Connection Status:* ESTABLISHED
                       ⚡ *Bot Version:* v2.0.0 (Stable Build)
                       👑 *Maintainer:* �𝐘𝚫𝚴𝚯𝐊𝚯𝐉𝚰 𝐊𝚰𝐄𝚯𝚻𝚫𝐊𝚫
                       🌐 *Platform:* WhatsApp Multi-Device
                       ⏱️ *Session:* ${new Date().toLocaleString()}
                       
                       ─────────────────────────────
                       
                       🛠️ *HOST THIS BOT YOURSELF:*
                       • bot-hosting.net (Recommended)
                       • Railway.app
                       • Heroku
                       • Koyeb.com
                       • Replit.com
                       • render.com
                       📚 *Resources:*
                       🌐 YouTube: youtube.com/@sophiaTechInc
                       💻 GitHub: github.com/A-Y-A-N-O-K-O-J-I/SOPHIA-MD
                       📢 Channel: whatsapp.com/channel/0029VasFQjXICVfoEId0lq0Q
                       📦 Source Code: [Same as GitHub]
                       
                       ─────────────────────────────
                       `;

                         await sock.sendMessage(sock.user.id, { text: extraMessage }, { quoted: sentMsg });
                        await delay(5000);
                        await removeFile(`./sessions.db`);
                        await sock.ws.close();
                    }
                } else if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
                    if (retryCount < maxRetries) {
                        retryCount++;
                        console.log(`Retrying connection (${retryCount}/${maxRetries})...`);
                        await delay(10000);
                        await initializePairingSession();
                    } else {
                        console.error("Max retries reached. Aborting.");
                        if (!res.headersSent) res.send({ code: "Service Unavailable" });
                    }
                }
            } catch (error) {
                console.error("Error during pairing process:", error);
                if (!res.headersSent) res.send({ code: "Service Unavailable" });
                await removeFile(`./sessions.db`);
            }
        });
    }

    try {
        await initializePairingSession();
    } catch (error) {
        console.error("Initialization error:", error);
        if (!res.headersSent) res.send({ code: "Initialization failed" });
    }
});

module.exports = router;
