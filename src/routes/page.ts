//page.ts
import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

router.get('/', (_req, res) => {
  const filePath = path.join(PUBLIC_DIR, 'index.html');
  console.log('Serving:', filePath);
  res.sendFile(filePath);
});

export default router;
