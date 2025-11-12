//root.ts
/**
 * Rotas de raiz e documentação rápida dos endpoints (GET /),
 * útil para verificação de saúde e referência rápida da API.
 */
import { Router } from 'express';

const router = Router();

router.get('/docs', (_req, res) => {
  res.type('text').send(
`PS Macro API
POST /sessions                (multipart: file)
POST /sessions/:sid/steps     { op, params }  -> adiciona passo
PUT  /sessions/:sid/steps/:i  { op, params }  -> edita passo i
DEL  /sessions/:sid/steps/:i                 -> remove passo i
GET  /sessions/:sid                                -> info da sessão (steps, meta)
POST /sessions/:sid/export?out=png&accept=json -> exporta imagem final
POST /sessions/:sid/savePreset { name, publish?, slug?, allowOverwrite? } -> salva preset (e publica opcionalmente)

GET  /presets                                    -> lista presets (admin)
PUT  /presets/:id                                 -> renomeia/publica/despublica
DEL  /presets/:id                                 -> remove preset

GET  /public/presets                              -> lista presets públicos
GET  /public/presets/:slug                        -> detalhes público
POST /public/process?slug=...&out=png&accept=json -> aplica preset público (multipart: file)
DEL  /public/presets/:slug                        -> despublica slug

Quando ?accept=json, respostas incluem { image:dataURL, log }.
`
  );
});

export default router;
