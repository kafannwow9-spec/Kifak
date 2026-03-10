import Database from 'better-sqlite3';

const db = new Database('bot.db');

// Server settings table
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    guildId TEXT PRIMARY KEY,
    leaveManagerRoleId TEXT,
    resignationManagerRoleId TEXT,
    leaveLogChannelId TEXT,
    leavePublicChannelId TEXT
  )
`);

// Active leaves table
db.exec(`
  CREATE TABLE IF NOT EXISTS active_leaves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guildId TEXT,
    userId TEXT,
    originalNickname TEXT,
    endTimestamp INTEGER,
    leaveMessageId TEXT,
    leaveChannelId TEXT,
    imageMessageId TEXT
  )
`);

// Pending requests table
db.exec(`
  CREATE TABLE IF NOT EXISTS pending_requests (
    userId TEXT PRIMARY KEY,
    guildId TEXT
  )
`);

export default db;
