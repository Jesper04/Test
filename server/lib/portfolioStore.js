'use strict';

const fs   = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '..', 'data', 'portfolio.json');

function save(data) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify({ ...data, savedAt: new Date().toISOString() }, null, 2));
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

module.exports = { save, load };
