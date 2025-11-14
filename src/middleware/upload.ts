// src/middleware/upload.ts
import multer, { type FileFilterCallback } from 'multer';

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  fileFilter(_req, file, cb: FileFilterCallback) {
    const ok = /^image\/(jpeg|png|webp|tiff|heic|avif)$/i.test(file.mimetype || '');

    if (!ok) {
      // rejeita o arquivo com erro
      return cb(new Error('Mimetype não suportado'));
    }

    // aceita o arquivo
    cb(null, true);
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});
