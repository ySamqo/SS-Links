const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { Pool } = require("pg");

const postgresUrl =
  process.env.SUPABASE_DB_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL;

let sqliteDb;
let pgPool;

function sqliteAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

function sqliteGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error);
      else resolve(row);
    });
  });
}

function sqliteRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function handleResult(error) {
      if (error) reject(error);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function toPostgresSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function setupSqlite() {
  const dataDirectory = process.env.VERCEL
    ? "/tmp"
    : path.join(__dirname, "..", "data");

  fs.mkdirSync(dataDirectory, { recursive: true });
  sqliteDb = new sqlite3.Database(path.join(dataDirectory, "app.db"));

  await sqliteRun(sqliteDb, `
    CREATE TABLE IF NOT EXISTS smart_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      destination_url TEXT NOT NULL,
      deeplink_url TEXT,
      deeplink_enabled INTEGER DEFAULT 0,
      source TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const smartLinkColumns = await sqliteAll(sqliteDb, "PRAGMA table_info(smart_links)");
  if (!smartLinkColumns.some((column) => column.name === "deeplink_url")) {
    await sqliteRun(sqliteDb, "ALTER TABLE smart_links ADD COLUMN deeplink_url TEXT");
  }
  if (!smartLinkColumns.some((column) => column.name === "deeplink_enabled")) {
    await sqliteRun(sqliteDb, "ALTER TABLE smart_links ADD COLUMN deeplink_enabled INTEGER DEFAULT 0");
  }

  await sqliteRun(sqliteDb, `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const userColumns = await sqliteAll(sqliteDb, "PRAGMA table_info(users)");
  if (!userColumns.some((column) => column.name === "role")) {
    await sqliteRun(sqliteDb, "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
  }

  await sqliteRun(sqliteDb, `
    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      smart_link_id INTEGER,
      event_type TEXT NOT NULL,
      country TEXT DEFAULT 'Unknown',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (smart_link_id) REFERENCES smart_links(id) ON DELETE SET NULL
    )
  `);

  const owner = await sqliteGet(sqliteDb, "SELECT id FROM users WHERE role = 'owner' LIMIT 1");
  if (!owner) {
    await sqliteRun(sqliteDb, "UPDATE users SET role = 'owner' WHERE id = (SELECT MIN(id) FROM users)");
  }
}

async function setupPostgres() {
  pgPool = new Pool({
    connectionString: postgresUrl,
    ssl: { rejectUnauthorized: false }
  });

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS smart_links (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      destination_url TEXT NOT NULL,
      deeplink_url TEXT,
      deeplink_enabled INTEGER DEFAULT 0,
      source TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pgPool.query("ALTER TABLE smart_links ADD COLUMN IF NOT EXISTS deeplink_url TEXT");
  await pgPool.query("ALTER TABLE smart_links ADD COLUMN IF NOT EXISTS deeplink_enabled INTEGER DEFAULT 0");

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pgPool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user'");

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id SERIAL PRIMARY KEY,
      smart_link_id INTEGER REFERENCES smart_links(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      country TEXT DEFAULT 'Unknown',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pgPool.query(`
    UPDATE users
    SET role = 'owner'
    WHERE id = (SELECT MIN(id) FROM users)
      AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'owner')
  `);
}

const ready = postgresUrl ? setupPostgres() : setupSqlite();

async function all(sql, params = []) {
  await ready;

  if (pgPool) {
    const result = await pgPool.query(toPostgresSql(sql), params);
    return result.rows;
  }

  return sqliteAll(sqliteDb, sql, params);
}

async function get(sql, params = []) {
  await ready;

  if (pgPool) {
    const result = await pgPool.query(toPostgresSql(sql), params);
    return result.rows[0];
  }

  return sqliteGet(sqliteDb, sql, params);
}

async function run(sql, params = []) {
  await ready;

  if (pgPool) {
    const result = await pgPool.query(toPostgresSql(sql), params);
    return { id: result.rows[0] && result.rows[0].id, changes: result.rowCount };
  }

  return sqliteRun(sqliteDb, sql, params);
}

module.exports = { all, get, run, ready, usingPostgres: Boolean(postgresUrl) };
