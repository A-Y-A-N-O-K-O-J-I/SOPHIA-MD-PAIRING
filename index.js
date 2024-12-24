const express = require('express');
const cors = require('cors');
const { generateQR } = require('./qr'); // Import the QR code generation function
const pairRouter = require('./pair'); // Import pair.js router
const { createSessionsTable } = require('./setupTable'); // Import table setup
require('./cleanup'); // Import the cleanup script to run the scheduled task
const validate = require('./valid');
// Set up Express app
const app = express();

// Set up CORS to allow specific origins
app.use(cors({
    origin: ['https://sophia-md-pair.vercel.app', 'http://localhost:3000'],
    methods: ['GET'],
    optionsSuccessStatus: 200,
}));

// Serve static files (like video, images, etc.) from the public folder
app.use(express.static('public'));

// Call the table setup to ensure the sessions table is created
createSessionsTable();

// Route to generate QR code
app.get('/qr', generateQR);

// Use the pairRouter for handling pairing coade generation at /pair route
app.use('/pair', pairRouter);

app.use('/validate',validate);
// Serve the main page with the background video
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html'); // Serve the index.html file from public
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
