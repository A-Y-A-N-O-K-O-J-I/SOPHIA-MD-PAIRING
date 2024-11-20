const mongoose = require('mongoose');

const AuthStateSchema = new mongoose.Schema({
  sessionID: { type: String, unique: true, required: true },
  authState: { type: Object, required: true },
  createdAt: { type: Date, default: Date.now, expires: 604800 }, // 7 days
});

module.exports = mongoose.model('AuthState', AuthStateSchema);
