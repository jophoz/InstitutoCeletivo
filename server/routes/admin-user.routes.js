const express = require("express");
const adminAuth = require("../middleware/admin-auth");
const { listUsers, createUser, changeOwnPassword, removeOwnAccess } = require("../controllers/admin-user.controller");

const router = express.Router();

router.use(adminAuth);
router.get("/", listUsers);
router.post("/", createUser);
router.post("/me/password", changeOwnPassword);
router.post("/me/remove", removeOwnAccess);

module.exports = router;
