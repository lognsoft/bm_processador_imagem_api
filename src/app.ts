// app.ts
import express from 'express';
import { permissiveCors } from './middleware/cors.js';
import { upload } from './middleware/upload.js';
import rootRoutes from './routes/root.js';
import sessionRoutes from './routes/sessions.js';
import presetRoutes from './routes/presets.js';
import publicRoutes from './routes/public.js';
import pageRoutes from './routes/page.js';

export const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(permissiveCors);

import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', rootRoutes);
app.use('/sessions', sessionRoutes(upload));
app.use('/presets', presetRoutes);
app.use('/public', publicRoutes(upload));


app.use('/', pageRoutes);
