const crypto = require('crypto');
const fs = require('fs');

// Define your encryption key
const encryption_key = 'AYANOKOJI-2306'; // Original key, will be hashed to 32 bytes

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
const encryptedFromFile = '61c38a9936e1880cca3b41b6075e393f:1c6214b83c9af52166de273cdafd34ead9f917e6991b8e58d6dca6864312217cf1525d2c8c1d87cf7079f8dae1eed009fc217739e0a736fcdcd7aaed900c28a8a8ccc76dbc16b1683e405672f1e93c741440426ce5ff6c35c3b286ba6ebeff20c10849e4b41c8d26430f9d0cf559cbc2e545253dc7d976ff48b28cd96971c65ec48e4a6603a16a652a9cdcc95bed489a' // Read the encrypted string from file

// Decrypt the data
const decrypted = decrypt(encryptedFromFile);
module.exports = { decrypted }
