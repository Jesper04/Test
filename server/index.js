'use strict';

// Register crash guards before anything else loads
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION — server staying alive]', err.stack || err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION — server staying alive]', reason?.stack || reason);
});

require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Reodor API running on http://localhost:${PORT}`);
});
