import Database from 'better-sqlite3';

const db = new Database('bot.db');

// Server settings table
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    guildId TEXT PRIMARY KEY,
    leaveManagerRoleId TEXT,
    resignationManagerRoleId TEXT,
    leaveLogChannelId TEXT,
    resignationLogChannelId TEXT,
    leavePublicChannelId TEXT,
    autoRolesEnabled INTEGER DEFAULT 0
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

// Pending resignations table
db.exec(`
  CREATE TABLE IF NOT EXISTS pending_resignations (
    userId TEXT PRIMARY KEY,
    guildId TEXT
  )
`);

// Permanent messages table
db.exec(`
  CREATE TABLE IF NOT EXISTS permanent_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guildId TEXT,
    channelId TEXT,
    content TEXT,
    isActive INTEGER DEFAULT 1,
    lastMessageId TEXT
  )
`);

export default db;
