const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");
const makeWASocket = require("baileys").default;
const { delay, Browsers } = require("baileys");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const pino = require("pino");
const { useSQLiteAuthState } = require("./auth");
const { migrateSessions } = require("./migrate");
const { Boom } = require("@hapi/boom");
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

async function generateQR(req, res) {
  const extraRandom = Math.random().toString(36).substring(2, 12).toUpperCase();
  const sessionID = `SOPHIA_MD-${uuidv4().replace(/-/g, "").toUpperCase()}${extraRandom}`;

  let responseSent = false;

  async function initializeQRSession() {
    const { state, saveState } = useSQLiteAuthState(sessionID);
    console.log("Authentication state initialized.");
    try {
      const sock = makeWASocket({
        auth: state,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        version: [2, 3000, 1028442591],
        browser: Browsers.windows("Safari"),
        syncFullHistory: true,
        generateHighQualityLinkPreview: true,
      });

      sock.ev.on("creds.update", saveState);

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Send QR code if available
        if (qr && !responseSent) {
          try {
            console.log(`Serving QR code for session: ${sessionID}`);
            const qrBuffer = await QRCode.toBuffer(qr);
            res.writeHead(200, { "Content-Type": "image/png" });
            res.end(qrBuffer);
            responseSent = true; // Mark response as sent
          } catch (error) {
            console.error("Error sending QR code:", error);
          }
        }

        if (connection === "open") {
          console.log("QR code scanned and session established.");
          const credsPath = "./sessions.db";
          if (fs.existsSync(credsPath)) {
            await migrateSessions();

            if (!responseSent) {
              res
                .status(500)
                .json({
                  error:
                    "Unable to store session in the database, please try again.",
                });
              responseSent = true; // Mark response as sent
            }

            // Send session ID and additional messages
            const sessionMessage = sessionID;
            const userJid = sock.user.lid.split(":")[0] + "@lid";
            const sentMsg = await sock.sendMessage(userJid, {
              text: sessionMessage,
            });

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
            await sock.sendMessage(
              userJid,
              { text: extraMessage },
              { quoted: sentMsg },
            );

            // Clean up temporary session data
            await delay(10000);
            await sock.ws.close();
            await removeFile(credsPath);
          } else {
            console.error("sessions.db not found!");
            if (!responseSent) {
              res
                .status(500)
                .json({
                  error:
                    "Session credentials not found, please try again later.",
                });
              responseSent = true; // Mark response as sent
            }
          }
        } else if (connection === "close") {
          const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
          console.log(reason);
          console.log("Connection closed:", reason);
        }
      });
    } catch (error) {
      console.error("Error initializing session:", error);
      if (!responseSent) {
        res.status(500).json({ error: "Service Unavailable" });
        responseSent = true; // Mark response as sent
      }
    }
  }

  // Start the QR session
  await initializeQRSession();
}

module.exports = { generateQR };
