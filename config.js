module.exports = {
  SESSION_ID: process.env.SESSION_ID || "", // This will be dynamically updated
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017", // MongoDB URI for connection
  PORT: process.env.PORT || 3000, // Server Port
};
