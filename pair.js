const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const fsPromises = require("fs").promises;
const pino = require("pino");
require("dotenv").config();
const express = require("express");
const router = express.Router();
const { useSQLiteAuthState } = require("./auth");
const { migrateSessions } = require("./migrate");
const {
  default: makeWASocket,
  delay,
  Browsers,
} = require("baileys");

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

router.get("/", async (req, res) => {
  console.log("Generating pairing code...");
  const extraRandom = Math.random().toString(36).substring(2, 22).toUpperCase();
  const sessionID = `SOPHIA_MD-${uuidv4().replace(/-/g, "").toUpperCase()}${extraRandom}`;
  console.log(`Generated session ID: ${sessionID}`);

  let num = req.query.number;
  let retryCount = 0;
  const maxRetries = 1;
  
  if (!num) {
    return res.status(400).json({
      message: "Number query required",
    });
  }

  async function initializePairingSession() {
    const { state, saveState, clearSession } = useSQLiteAuthState(sessionID);
    console.log("Authentication state initialized.");

    const sock = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      browser: Browsers.macOS("Safari"),
      version: [2, 3000, 1028442591],
      syncFullHistory: true,
      generateHighQualityLinkPreview: true,
    });

    if (!sock.authState.creds.registered) {
      console.log("Requesting pairing code...");
      await delay(1500);
      num = num.replace(/[^0-9]/g, "");
      const code = await sock.requestPairingCode(num);
      if (!res.headersSent) res.send({ code });
    }

    sock.ev.on("creds.update", saveState);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;
      
      try {
        if (connection === "open") {
          console.log("Connection established.");
          await delay(10000);
          
          // Migration with proper error handling
          try {
            await migrateSessions();
            console.log("✅ Session migrated to PostgreSQL successfully");
          } catch (migrationError) {
            console.error("❌ CRITICAL: Migration failed!", migrationError.message);
            
            // Send error to user
            const userJid = sock.user.lid.split(":")[0] + "@lid";
            await sock.sendMessage(userJid, {
              text: `❌ *MIGRATION FAILED*\n\nYour session could not be saved to the vault.\n\nError: ${migrationError.message}\n\nPlease contact support or try again.`
            });
            
            // Clean up and close
            await delay(3000);
            sock.ev.off("creds.update", saveState)
            clearSession()
            await sock.ws.close();
            
            if (!res.headersSent) {
              res.status(500).json({ 
                error: "Migration failed", 
                message: migrationError.message 
              });
            }
            return; // Stop execution
          }
          
          if (fs.existsSync(credsPath)) {
            await delay(5000);
            console.log("Credentials saved to PostgreSQL");
            const userJid = sock.user.lid.split(":")[0] + "@lid";
            
            // Send session ID
            const sentMsg = await sock.sendMessage(userJid, {
              text: sessionID,
            });

            // Properly formatted WhatsApp message
            const extraMessage = `*╭━━━━━━━━━━━━━━━━━━━╮*
*│  SOPHIA-MD CONNECTED  │*
*╰━━━━━━━━━━━━━━━━━━━╯*

✅ *Status:* Connected Successfully
⚡ *Version:* v2.0.0 (Stable)
👑 *Maintainer:* AYANOKOJI KIYOTAKA
🌐 *Platform:* WhatsApp Multi-Device
⏱️ *Time:* ${new Date().toLocaleString()}

*━━━━━━━━━━━━━━━━━━━*

🛠️ *HOST THIS BOT YOURSELF:*
• bot-hosting.net (Recommended)
• Railway.app
• Heroku
• Koyeb.com
• Replit.com
• render.com

*━━━━━━━━━━━━━━━━━━━*

📚 *RESOURCES:*
🌐 YouTube: youtube.com/@sophiaTechInc
💻 GitHub: github.com/A-Y-A-N-O-K-O-J-I/SOPHIA-MD
📢 Channel: whatsapp.com/channel/0029VasFQjXICVfoEId0lq0Q

*━━━━━━━━━━━━━━━━━━━*

_Thank you for using SOPHIA-MD!_`;

            await sock.sendMessage(
              userJid,
              { text: extraMessage },
              { quoted: sentMsg }
            );
            
            await delay(5000);
            sock.ev.off("creds.update", saveState)
            clearSession()
            await sock.ws.close();
          }
        } else if (
          connection === "close" &&
          lastDisconnect?.error?.output?.statusCode !== 401
        ) {
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
        clearSession()
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