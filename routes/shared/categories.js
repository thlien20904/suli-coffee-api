const express = require('express');
const router = express.Router();

// ví dụ route test
router.get('/', (req, res) => {
  res.send('Admin - Products API working!');
});

module.exports = router;
