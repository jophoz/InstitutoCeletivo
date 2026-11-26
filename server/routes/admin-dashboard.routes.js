const express = require("express");
const adminAuth = require("../middleware/admin-auth");
const { getDashboard, refreshSales, listCampaigns, removeCopy } = require("../controllers/dashboard.controller");

const router = express.Router();

router.use(adminAuth);
router.get("/", getDashboard);
router.get("/campaigns", listCampaigns);
router.post("/refresh", refreshSales);
router.delete("/copies/:host", removeCopy);

module.exports = router;
