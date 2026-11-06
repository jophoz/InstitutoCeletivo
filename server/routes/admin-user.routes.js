const express = require("express");
const adminAuth = require("../middleware/admin-auth");
const { listUsers, createUser, deleteUser, changeOwnPassword } = require("../controllers/admin-user.controller");

const router = express.Router();

router.use(adminAuth);
router.get("/", listUsers);
router.post("/", createUser);
router.post("/me/password", changeOwnPassword);
router.delete("/:id", deleteUser);

module.exports = router;
