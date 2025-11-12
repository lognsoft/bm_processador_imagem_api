//app.ts
/**
 * Cria e configura a instância do Express. Aplica middlewares globais,
 * JSON parser, CORS permissivo e registra todas as rotas do sistema.
 * Este módulo não sobe o servidor; apenas monta o aplicativo.
 */
import express from 'express';
import { permissiveCors } from './middleware/cors.js';
import { upload } from './middleware/upload.js';
import rootRoutes from './routes/root.js';
import sessionRoutes from './routes/sessions.js';
import presetRoutes from './routes/presets.js';
import publicRoutes from './routes/public.js';

export const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(permissiveCors);

app.use('/', rootRoutes);
app.use('/sessions', sessionRoutes(upload));
app.use('/presets', presetRoutes);
app.use('/public', publicRoutes(upload));
