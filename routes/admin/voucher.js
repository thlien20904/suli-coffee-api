const express = require("express");
const router = express.Router();
const voucherController = require("../../controllers/admin/voucherController");

router.get("/", voucherController.getAllVouchers);
router.get("/assigned", voucherController.getAssignedVouchers);
router.post("/assign", voucherController.assignVoucherToUser);
router.post("/assign/all", voucherController.assignVoucherToAllUsers);
router.get("/user/:id", voucherController.getUserVouchers);
router.post("/add", voucherController.addVoucher);
router.post("/edit/:id", voucherController.editVoucher);
router.post("/delete", voucherController.deleteVoucher);
router.put("/toggle/:id", voucherController.toggleVoucher);
router.get("/:id", voucherController.getVoucherById);

module.exports = router;
