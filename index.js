// index.js
const express = require('express');
const cors = require('cors');
const { generateQR } = require('./qr'); // Import the QR code generation function
const { generatePairingCode } = require('./pair'); // Import the pairing code generation function
const { createSessionsTable } = require('./setupTable'); // Import table setup

// Set up CORS to allow specific origins (adjust based on your needs)
const app = express();
app.use(cors({
    origin: ['https://sophia-md-pair.vercel.app', 'http://localhost:3000'],
    methods: ['GET'],
    optionsSuccessStatus: 200,
}));

// Call the table setup to ensure the sessions table is created
createSessionsTable();

// Route to generate QR code
app.get('/qr', generateQR);

// Route to handle pairing code
app.get('/pair', generatePairingCode);

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
