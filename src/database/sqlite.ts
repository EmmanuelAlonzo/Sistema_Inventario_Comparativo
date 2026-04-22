import * as SQLite from 'expo-sqlite';

export const dbLocal = SQLite.openDatabaseSync('contarv_offline.db');

export const initDB = async () => {
  await dbLocal.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS conteos_picking (
      id TEXT PRIMARY KEY,
      lote TEXT NOT NULL,
      cantidad_fisica REAL NOT NULL,
      nave TEXT NOT NULL,
      fila TEXT NOT NULL,
      columna TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      sincronizado_drive INTEGER DEFAULT 0
    );
  `);
  console.log('BD Local (SQLite) Inicializada con esquema de Layout (Nave/Fila/Columna) OK.');
};
