const QRCode = require("qrcode");
const crypto = require("crypto");
const { delay, DisconnectReason } = require("baileys");
const { useSQLiteAuthState, getAllKeysForSession, clearSession } = require("./auth");
const { Boom } = require("@hapi/boom");
const { createSocket } = require("./connectionLogic");
const { saveToVault } = require("./vault");
const config = require("./config");

async function generateQR(_req, res) {
  const sessionId = `SOPHIA_MD-${crypto.randomBytes(16).toString("hex").toUpperCase()}`;

  let responseSent = false;
  let sessionSaved = false;

  async function run() {
    clearSession(sessionId);
    const { state, saveState } = useSQLiteAuthState(sessionId);

    async function connect() {
      const sock = await createSocket(state);
      sock.ev.on("creds.update", saveState);

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        try {
          if (qr && !responseSent) {
            responseSent = true;
            console.log(`📸 [${sessionId.slice(-8)}] Serving QR code`);
            const qrBuffer = await QRCode.toBuffer(qr);
            res.writeHead(200, { "Content-Type": "image/png" });
            res.end(qrBuffer);
          }

          if (connection === "open" && !sessionSaved) {
            sessionSaved = true;
            console.log(`✅ [${sessionId.slice(-8)}] QR scanned! Saving to vault...`);

            try {
              if (config.VAULT_DATABASE_URL) {
                const keyRows = getAllKeysForSession(sessionId);
                await saveToVault(config.VAULT_DATABASE_URL, sessionId, null, sock.authState.creds, keyRows);
                console.log("✅ Session saved to vault");
              }

              // Get the bot's own JID to send session ID back to the user
              const num = sock.user.id.split(":")[0].split("@")[0];
              const userJid = `${num}@s.whatsapp.net`;

              await delay(3000);

              const sentMsg = await sock.sendMessage(userJid, {
                text: sessionId,
              });

              await sock.sendMessage(userJid, {
                text: `*╭━━━━━━━━━━━━━━━━━━━╮*
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

            clearSession(sessionId);
          }
        } catch (err) {
          console.error("❌ QR error:", err);
          clearSession(sessionId);
        }
      });
    }

    await connect();
  }

  try {
    await run();
  } catch (err) {
    console.error("❌ QR initialization error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate QR code" });
    }
  }
}

module.exports = { generateQR };
