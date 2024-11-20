const express = require('express');
const mongoose = require('mongoose');
const config = require('./config');
const qrRoutes = require('./routes/qrRoutes');

const app = express();

// Connect to MongoDB
mongoose
  .connect(config.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Middleware
app.use(express.json());
app.use('/api', qrRoutes);

// Start server
app.listen(config.PORT, () => {
  console.log(`Server running on http://localhost:${config.PORT}`);
});
