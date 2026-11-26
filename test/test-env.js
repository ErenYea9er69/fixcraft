import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.DB_PATH) {
  process.env.DB_PATH = path.resolve(__dirname, `test-fixcraft-${process.pid}.db`);
}

process.env.NODE_ENV = 'test';
