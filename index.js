const { Pool } = require('pg'); // PostgreSQL library
const QRCode = require('qrcode');
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const app = express();
require('./setupTable'); // Automatically sets up the table

const pool = new Pool({
  connectionString: 'YOUR_DATABASE_URL', // Replace with your PostgreSQL database URL
});

let connectionStatus = { status: 'waiting' }; // Track QR code status globally

// Helper: Remove a directory
function removeFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { recursive: true, force: true });
  }
}

app.use(cors({
  origin: ['https://sophia-md-pair.vercel.app', 'http://localhost:3000'], // Add local dev support if necessary
  methods: ['GET'],
  optionsSuccessStatus: 200,
}));
// Route: Generate QR code
app.get('/qr', async (req, res) => {
  const extraRandom = Math.random().toString(36).substring(2, 12).toUpperCase();
  const sessionID = `SOPHIA_MD-${uuidv4().replace(/-/g, '').toUpperCase()}${extraRandom}`;

  async function initializeQRSession() {
    const { state, saveCreds } = await useMultiFileAuthState(`./temp/${sessionID}`);

    try {
      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // Disable terminal QR
      });

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Send the QR code to the client
        if (qr) {
          try {
            console.log(`Serving QR code for session: ${sessionID}`);
            const qrBuffer = await QRCode.toBuffer(qr);
            res.writeHead(200, { 'Content-Type': 'image/png' });
            res.end(qrBuffer);
          } catch (error) {
            console.error('Error sending QR code:', error);
          }
        }

        // Handle QR Code Expiry and Reconnection
        if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== 401) {
          console.log('Connection closed. Reconnecting...');
          initializeQRSession(); // Automatically regenerate QR
        }

        // QR code scanned successfully
        if (connection === 'open') {
          console.log('QR code scanned and session established.');

          connectionStatus = { status: 'scanned' };

          // Wait for credentials to save
          await new Promise(resolve => setTimeout(resolve, 5000));

          // Save credentials to Base64 and store in PostgreSQL
          const credsPath = path.join(__dirname, `temp/${sessionID}/creds.json`);
          const credsData = fs.readFileSync(credsPath);
          const base64Data = Buffer.from(credsData).toString('base64');

          const client = await pool.connect();
          try {
            await client.query(
              'INSERT INTO sessions (session_id, base64_creds) VALUES ($1, $2)',
              [sessionID, base64Data]
            );
            console.log(`Session ${sessionID} stored in PostgreSQL.`);
          } catch (dbError) {
            console.error('Error saving to PostgreSQL:', dbError);
          } finally {
            client.release();
          }

          // Cleanup temporary files
          removeFile(`temp/${sessionID}`);
          console.log(`Temporary files for session ${sessionID} removed.`);

          // Close the WebSocket connection after notifying the user
          await sock.sendMessage(sock.user.id, { text: `Session created successfully! ID: ${sessionID}` });
          await sock.ws.close();
        }
      });
    } catch (error) {
      console.error('Error initializing session:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Service Unavailable' });
      }
    }
  }

  // Start the QR session
  await initializeQRSession();
});

// Route: Check QR Code status
app.get('/status', (req, res) => {
  res.json(connectionStatus);
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
