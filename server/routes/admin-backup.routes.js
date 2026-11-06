const express = require("express");
const adminAuth = require("../middleware/admin-auth");
const { MAX_BYTES } = require("../lib/images");
const { exportBackup, checkBackup, importMedia, importContent } = require("../controllers/backup.controller");

const router = express.Router();

// Conteúdo do backup (sem as imagens): páginas de vendas grandes somam mais que o limite geral de
// 300 KB do app.js, que pula esta rota.
const CONTENT_LIMIT = "10mb";

router.use(adminAuth);
router.get("/", exportBackup);
router.post("/check", checkBackup);
router.post("/media/:id", express.raw({ type: "image/webp", limit: MAX_BYTES }), importMedia);
router.post("/content", express.json({ limit: CONTENT_LIMIT }), importContent);

module.exports = router;
