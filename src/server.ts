/**
 * Ponto de entrada da aplicação. Sobe o servidor HTTP, carrega o app (Express)
 * e exibe informações de inicialização (porta, versão do Node, diretório de dados).
 * Não define rotas — apenas inicia o listener.
 */
import { app } from './app.js';
import { LOG_LEVEL, DATA_DIR } from './config.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor Online -> http://localhost:${PORT}`);
  console.log(`Node: ${process.version}`);
  console.log(`LOG_LEVEL=${LOG_LEVEL}`);
  console.log(`Data dir: ${DATA_DIR}`);
});
