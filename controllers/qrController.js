const { default: makeWASocket } = require('@whiskeysockets/baileys');
const AuthState = require('../models/authState');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

async function generateSessionID() {
  return `SOPHIA_MD_${uuidv4().replace(/-/g, '')}`;
}

async function generateQR(req, res) {
  const sessionID = await generateSessionID();

  const sock = makeWASocket({
    printQRInTerminal: false, // Disable terminal QR code
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr } = update;

    if (qr) {
      // Convert QR code to base64 format
      const qrCodeImage = await QRCode.toDataURL(qr);
      return res.status(200).json({
        sessionID,
        qrCode: qrCodeImage, // Send the QR code to the client
      });
    }

    if (connection === 'open') {
      console.log('Connected successfully. Saving auth state...');
      await AuthState.create({ sessionID, authState: sock.authState });
      console.log(`Auth state saved with session ID: ${sessionID}`);
    }
  });
}

module.exports = { generateQR };
