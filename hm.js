const crypto = require('crypto');
const fs = require('fs');
const config = require('./config');

// Define your encryption key
const encryption_key = config.SESSION_ID; // Original key, will be hashed to 32 bytes

// Hash the encryption key to ensure it's 32 bytes long
const hashedKey = crypto.createHash('sha256').update(encryption_key).digest();

// Decrypt function
function decrypt(encryptedText) {
  // Split the encrypted string into IV and encrypted text
  const [ivHex, encryptedData] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex'); // Convert IV back to a buffer

  // Create the decipher with the same key and IV
  const decipher = crypto.createDecipheriv('aes-256-cbc', hashedKey, iv);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Read the encrypted data from the file
const encryptedFromFile = config.SESSSION_ID // Read the encrypted string from file

// Decrypt the data
const djxndjjdkddnd = decrypt(encryptedFromFile);
module.exports = { djxndjjdkddnd }
