ps-macro-api/
├─ package.json
├─ tsconfig.json
├─ .gitignore
│
├─ data/                     # Persistência simples no disco
│  ├─ presets.json           # Presets do painel admin
│  └─ public-presets.json    # Presets públicos (liberados para o front público)
│
└─ src/
   ├─ server.ts              # Ponto de entrada (inicia HTTP)
   ├─ app.ts                 # Instancia Express + middlewares + rotas
   ├─ config.ts              # Configurações gerais (paths, LOG_LEVEL, etc)
   ├─ types.ts               # Tipos compartilhados (Session, Preset, Step...)
   │
   ├─ utils/                 # Funções utilitárias puras
   │  ├─ bytes.ts            # Formatação de tamanhos (ex.: 1.4MB)
   │  ├─ time.ts             # Helpers de tempo (ex.: ms(), timestamp(), etc.)
   │  ├─ json-file.ts        # Funções de ler/gravar JSON com segurança
   │  ├─ logger.ts           # Logger com níveis (debug, info, warn, error)
   │  ├─ mime.ts             # Detectar MIME, extensões e validações
   │  └─ strings.ts          # Pequenos helpers de string
   │
   ├─ middleware/            # Middlewares reutilizáveis no Express
   │  ├─ cors.ts             # Configuração de CORS
   │  └─ upload.ts           # Multer configurado para uploads
   │
   ├─ store/                 # Estado da aplicação em memória + persistência
   │  ├─ sessionsStore.ts    # CRUD de sessões (sessão = imagem+pipeline atual)
   │  └─ presetsStore.ts     # CRUD + publicação de presets
   │
   ├─ services/              # Core do domínio (onde acontece o processamento real)
   │  ├─ ops.ts              # Implementação dos operadores (bw, bc, shadows...)
   │  └─ pipeline.ts         # Executa a pipeline passo-a-passo sobre uma imagem
   │
   └─ routes/                # Rotas agrupadas por contexto
      ├─ root.ts             # GET / -> retorna help/status simples
      ├─ sessions.ts         # /sessions (criar sessão, editar passos, exportar)
      ├─ presets.ts          # /presets (CRUD + publicar preset para público)
      └─ public.ts           # /public/process -> endpoint público sem admin
