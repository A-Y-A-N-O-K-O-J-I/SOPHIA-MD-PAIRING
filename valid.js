const express = require('express');
const { isValidNumber, parsePhoneNumber } = require('libphonenumber-js');

const router = express.Router();

// Validation endpoint
router.post('/', (req, res) => {
  const { number } = req.body;

  if (!number) {
    return res.status(400).json({
      valid: false,
      message: 'Phone number is required.',
    });
  }

  try {
    const phoneNumber = parsePhoneNumber(number, 'US'); // Specify your default country
    if (phoneNumber && phoneNumber.isValid()) {
      return res.json({
        valid: true,
        formatted: phoneNumber.formatInternational(),
      });
    } else {
      return res.json({
        valid: false,
        message: 'Invalid phone number. Ensure it starts with "+" and includes the correct country code.',
      });
    }
  } catch (error) {
    console.error("PhoneNumber Parsing Error:", error);
    return res.status(500).json({
      valid: false,
      message: 'Internal server error while processing the phone number.',
    });
  }
});

module.exports = router;