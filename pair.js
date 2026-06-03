const express = require("express");
const crypto = require("crypto");
const { Boom } = require("@hapi/boom");
const router = express.Router();
const { useSQLiteAuthState, getAllKeysForSession, clearSession } = require("./auth");
const { delay, DisconnectReason } = require("baileys");
const { createSocket } = require("./connectionLogic");
const { saveToVault } = require("./vault");
const config = require("./config");

router.get("/", async (req, res) => {
  let num = req.query.number;
  if (!num) {
    console.log("Database url:", process.env)
    return res.status(400).json({
      message: "Number query parameter required",
      example: "/pair?number=1234567890",
    });
  }
  num = num.replace(/[^0-9]/g, "");

  // Unique session ID per pairing attempt
  const sessionId = `SOPHIA_MD-${crypto.randomBytes(16).toString("hex").toUpperCase()}`;

  let pairingCodeGenerated = false;
  let sessionSaved = false;

  async function run() {
    // Clear any stale data before starting
    clearSession(sessionId);
    const { state, saveState } = useSQLiteAuthState(sessionId);

    async function connect() {
      const sock = await createSocket(state);
      sock.ev.on("creds.update", saveState);

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        console.log(`🔄 [${sessionId.slice(-8)}] ${connection}`);

        try {
          // qr fires when the WS is open and Baileys is ready for auth — the
          // correct window to call requestPairingCode instead of scanning a QR.
          if (update.qr && !sock.authState.creds.registered && !pairingCodeGenerated) {
            pairingCodeGenerated = true;
            console.log("📱 Requesting pairing code...");
            try {
              const code = await sock.requestPairingCode(num);
              console.log(`✅ Code generated: ${code}`);
              if (!res.headersSent) {
                res.json({
                  code,
                  sessionId,
                  message: "Enter this code in WhatsApp. Your session ID will be sent to your number after pairing.",
                  phoneNumber: num,
                });
              }
            } catch (err) {
              console.error("❌ Error generating pairing code:", err);
              if (!res.headersSent) {
                res.status(500).json({
                  error: "Failed to generate pairing code",
                  message: "Please try again.",
                  details: err.message,
                });
              }
              sock.ev.removeAllListeners();
              clearSession(sessionId);
            }
          }

          if (connection === "open" && !sessionSaved) {
            sessionSaved = true;
            console.log(`✅ [${sessionId.slice(-8)}] Paired! Saving to vault...`);

            try {
              if (config.VAULT_DATABASE_URL) {
                const keyRows = getAllKeysForSession(sessionId);
                await saveToVault(config.VAULT_DATABASE_URL, sessionId, num, sock.authState.creds, keyRows);
                console.log("✅ Session saved to vault");
              }

              await delay(3000);
              const userJid = `${num}@s.whatsapp.net`;

              // Send session ID first
              const sentMsg = await sock.sendMessage(userJid, {
                text: sessionId,
              });

              // Then send the formatted info message
              await sock.sendMessage(userJid, {
                text: `*╭━━━━━━━━━━━━━━━━━━━╮*
*│  SOPHIA-MD CONNECTED  │*
*╰━━━━━━━━━━━━━━━━━━━╯*

✅ *Status:* Connected Successfully
⚡ *Version:* v4.0.0 (Stable)
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

_Thank you for using SOPHIA-MD!_`,
              }, { quoted: sentMsg });
              console.log(`✅ Session ID sent to ${num}`);
            } catch (err) {
              console.error("❌ Error saving/sending session:", err);
            } finally {
              await delay(2000);
              sock.ev.removeAllListeners();
              try { sock.ws.close(); } catch (_) {}
              console.log(`✅ [${sessionId.slice(-8)}] Done, socket closed.`);
            }
          }

          if (connection === "close" && !sessionSaved) {
            const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            console.log(`❌ [${sessionId.slice(-8)}] Closed (reason: ${reason})`);

            if (reason === DisconnectReason.restartRequired) {
              console.log(`🔄 [${sessionId.slice(-8)}] Restart required, reconnecting...`);
              connect();
              return;
            }

            if (!res.headersSent) {
              res.status(500).json({
                error: "Connection lost",
                message: "Pairing failed. Please try again.",
              });
            }
            clearSession(sessionId);
          }
        } catch (err) {
          console.error("❌ Pairing error:", err);
          if (!res.headersSent) {
            res.status(500).json({ error: "Service error", message: "Please try again." });
          }
          clearSession(sessionId);
        }
      });
    }

    await connect();
  }

  try {
    await run();
  } catch (err) {
    console.error("❌ Initialization error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Initialization failed", message: "Please try again." });
    }
  }
});

module.exports = router;
