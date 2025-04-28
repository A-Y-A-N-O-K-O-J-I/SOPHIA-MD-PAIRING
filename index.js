const express = require('express');
const cors = require('cors');
const { generateQR } = require('./qr');
const pairRouter = require('./pair');
const validate = require('./valid');
const {generateQR2} = require("./term-qr")
const termPairRouter = require("./term-pair")
const app = express();

app.use(cors({
    origin: ['https://sophia-md-pair.vercel.app', 'http://localhost:3000'],
    methods: ['GET'],
    optionsSuccessStatus: 200,
}));

// Middleware to parse JSON request bodies
app.use(express.json());

// Serve static files (like video, images, etc.) from the public folder
app.use(express.static('public'));



// Route to generate QR code
app.get('/qr', generateQR);

// Use the pairRouter for handling pairing code generation at /pair route
app.use('/pair', pairRouter);

// Use the validate router for the /valid endpoint
app.use('/valid', validate); // Maps the /valid route to the validate.js router
app.use('/term-pair',termPairRouter);
app.use('/term-qr',generateQR2);
// Serve the main page with the background video
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html'); // Serve the index.html file from public
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
