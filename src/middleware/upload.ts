/**
 * Configura o Multer para uploads em memória, validando tipos compatíveis
 * e limitando o tamanho máximo do arquivo de imagem.
 */
import multer from 'multer';

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /image\/(jpeg|png|webp|tiff|heic|avif)/i.test(file.mimetype || '');
    cb(ok ? null : new Error('Mimetype não suportado'), ok);
  }
});
