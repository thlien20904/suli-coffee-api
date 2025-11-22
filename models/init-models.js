var DataTypes = require("sequelize").DataTypes;
var _AccRole = require("./AccRole");
var _Account = require("./Account");
var _Category = require("./Category");
var _CuaHang = require("./CuaHang");
var _DeliveryAddresses = require("./DeliveryAddresses");
var _Food = require("./Food");
var _FoodDimensions = require("./FoodDimensions");
var _FoodIngredient = require("./FoodIngredient");
var _GioHang = require("./GioHang");
var _GioHang_Topping = require("./GioHang_Topping");
var _Ingredient = require("./Ingredient");
var _Invoice = require("./Invoice");
var _InvoiceDetail = require("./InvoiceDetail");
var _Notifications = require("./Notifications");
var _OrderDetails = require("./OrderDetails");
var _OrderDetails_Topping = require("./OrderDetails_Topping");
var _OrderStatus = require("./OrderStatus");
var _Orders = require("./Orders");
var _PaymentStatus = require("./PaymentStatus");
var _PhuongThucThanhToan = require("./PhuongThucThanhToan");
var _ShippingOrders = require("./ShippingOrders");
var _Size = require("./Size");
var _Staff = require("./Staff");
var _TableFood = require("./TableFood");
var _Topping = require("./Topping");
var _UserVouchers = require("./UserVouchers");
var _Users = require("./Users");
var _Vouchers = require("./Vouchers");
var _Warehouse = require("./Warehouse");
var _OrderReviews = require("./OrderReviews"); //mới

function initModels(sequelize) {
  var AccRole = _AccRole(sequelize, DataTypes);
  var Account = _Account(sequelize, DataTypes);
  var Category = _Category(sequelize, DataTypes);
  var CuaHang = _CuaHang(sequelize, DataTypes);
  var DeliveryAddresses = _DeliveryAddresses(sequelize, DataTypes);
  var Food = _Food(sequelize, DataTypes);
  var FoodDimensions = _FoodDimensions(sequelize, DataTypes);
  var FoodIngredient = _FoodIngredient(sequelize, DataTypes);
  var GioHang = _GioHang(sequelize, DataTypes);
  var GioHang_Topping = _GioHang_Topping(sequelize, DataTypes);
  var Ingredient = _Ingredient(sequelize, DataTypes);
  var Invoice = _Invoice(sequelize, DataTypes);
  var InvoiceDetail = _InvoiceDetail(sequelize, DataTypes);
  var Notifications = _Notifications(sequelize, DataTypes);
  var OrderDetails = _OrderDetails(sequelize, DataTypes);
  var OrderDetails_Topping = _OrderDetails_Topping(sequelize, DataTypes);
  var OrderStatus = _OrderStatus(sequelize, DataTypes);
  var Orders = _Orders(sequelize, DataTypes);
  var PaymentStatus = _PaymentStatus(sequelize, DataTypes);
  var PhuongThucThanhToan = _PhuongThucThanhToan(sequelize, DataTypes);
  var ShippingOrders = _ShippingOrders(sequelize, DataTypes);
  var Size = _Size(sequelize, DataTypes);
  var Staff = _Staff(sequelize, DataTypes);
  var TableFood = _TableFood(sequelize, DataTypes);
  var Topping = _Topping(sequelize, DataTypes);
  var UserVouchers = _UserVouchers(sequelize, DataTypes);
  var Users = _Users(sequelize, DataTypes);
  var Vouchers = _Vouchers(sequelize, DataTypes);
  var Warehouse = _Warehouse(sequelize, DataTypes);
  var OrderReviews = _OrderReviews(sequelize, DataTypes); //mới

  Staff.belongsTo(AccRole, { as: "Role", foreignKey: "RoleId" });
  AccRole.hasMany(Staff, { as: "Staffs", foreignKey: "RoleId" });
  Staff.belongsTo(Account, { as: "Account", foreignKey: "AccountId" });
  Account.hasMany(Staff, { as: "Staffs", foreignKey: "AccountId" });
  Food.belongsTo(Category, { as: "Category", foreignKey: "CategoryId" });
  Category.hasMany(Food, { as: "Foods", foreignKey: "CategoryId" });
  Orders.belongsTo(CuaHang, { as: "CuaHang", foreignKey: "CuaHangId" });
  CuaHang.hasMany(Orders, { as: "Orders", foreignKey: "CuaHangId" });
  FoodDimensions.belongsTo(Food, { as: "Food", foreignKey: "FoodId" });
  Food.hasMany(FoodDimensions, { as: "FoodDimensions", foreignKey: "FoodId" });
  FoodIngredient.belongsTo(Food, { as: "Food", foreignKey: "FoodId" });
  Food.hasMany(FoodIngredient, { as: "FoodIngredients", foreignKey: "FoodId" });
  GioHang.belongsTo(Food, { as: "Food", foreignKey: "FoodId" });
  Food.hasMany(GioHang, { as: "GioHangs", foreignKey: "FoodId" });
  InvoiceDetail.belongsTo(Food, { as: "Food", foreignKey: "FoodId" });
  Food.hasMany(InvoiceDetail, { as: "InvoiceDetails", foreignKey: "FoodId" });
  OrderDetails.belongsTo(Food, { as: "Food", foreignKey: "FoodId" });
  Food.hasMany(OrderDetails, { as: "OrderDetails", foreignKey: "FoodId" });
  GioHang_Topping.belongsTo(GioHang, {
    as: "GioHang",
    foreignKey: "GioHangID",
  });
  GioHang.hasMany(GioHang_Topping, {
    as: "GioHang_Toppings",
    foreignKey: "GioHangID",
  });
  Food.belongsTo(Ingredient, { as: "Ingredient", foreignKey: "IngredientId" });
  Ingredient.hasMany(Food, { as: "Foods", foreignKey: "IngredientId" });
  FoodIngredient.belongsTo(Ingredient, {
    as: "Ingredient",
    foreignKey: "IngredientId",
  });
  Ingredient.hasMany(FoodIngredient, {
    as: "FoodIngredients",
    foreignKey: "IngredientId",
  });
  Warehouse.belongsTo(Ingredient, {
    as: "Ingredient",
    foreignKey: "IngredientId",
  });
  Ingredient.hasMany(Warehouse, {
    as: "Warehouses",
    foreignKey: "IngredientId",
  });
  InvoiceDetail.belongsTo(Invoice, { as: "Invoice", foreignKey: "InvoiceId" });
  Invoice.hasMany(InvoiceDetail, {
    as: "InvoiceDetails",
    foreignKey: "InvoiceId",
  });
  OrderDetails_Topping.belongsTo(OrderDetails, {
    as: "OrderDetail",
    foreignKey: "OrderDetailId",
  });
  OrderDetails.hasMany(OrderDetails_Topping, {
    as: "OrderDetails_Toppings",
    foreignKey: "OrderDetailId",
  });
  Orders.belongsTo(OrderStatus, { as: "Status", foreignKey: "StatusId" });
  OrderStatus.hasMany(Orders, { as: "Orders", foreignKey: "StatusId" });
  OrderDetails.belongsTo(Orders, { as: "Order", foreignKey: "OrderId" });
  Orders.hasMany(OrderDetails, { as: "OrderDetails", foreignKey: "OrderId" });
  ShippingOrders.belongsTo(Orders, { as: "Order", foreignKey: "OrderId" });
  Orders.hasMany(ShippingOrders, {
    as: "ShippingOrders",
    foreignKey: "OrderId",
  });
  Orders.belongsTo(PaymentStatus, {
    as: "PaymentStatus",
    foreignKey: "PaymentStatusId",
  });
  PaymentStatus.hasMany(Orders, {
    as: "Orders",
    foreignKey: "PaymentStatusId",
  });
  Orders.belongsTo(PhuongThucThanhToan, {
    as: "PaymentMethod",
    foreignKey: "PaymentMethodId",
  });
  PhuongThucThanhToan.hasMany(Orders, {
    as: "Orders",
    foreignKey: "PaymentMethodId",
  });
  GioHang.belongsTo(Size, { as: "Size", foreignKey: "SizeID" });
  Size.hasMany(GioHang, { as: "GioHangs", foreignKey: "SizeID" });
  OrderDetails.belongsTo(Size, { as: "Size", foreignKey: "SizeId" });
  Size.hasMany(OrderDetails, { as: "OrderDetails", foreignKey: "SizeId" });
  Invoice.belongsTo(TableFood, { as: "Table", foreignKey: "TableId" });
  TableFood.hasMany(Invoice, { as: "Invoices", foreignKey: "TableId" });
  GioHang_Topping.belongsTo(Topping, {
    as: "Topping",
    foreignKey: "ToppingID",
  });
  Topping.hasMany(GioHang_Topping, {
    as: "GioHang_Toppings",
    foreignKey: "ToppingID",
  });
  OrderDetails.belongsTo(Topping, { as: "Topping", foreignKey: "ToppingId" });
  Topping.hasMany(OrderDetails, {
    as: "OrderDetails",
    foreignKey: "ToppingId",
  });
  OrderDetails_Topping.belongsTo(Topping, {
    as: "Topping",
    foreignKey: "ToppingId",
  });
  Topping.hasMany(OrderDetails_Topping, {
    as: "OrderDetails_Toppings",
    foreignKey: "ToppingId",
  });
  DeliveryAddresses.belongsTo(Users, { as: "User", foreignKey: "UserId" });
  Users.hasMany(DeliveryAddresses, {
    as: "DeliveryAddresses",
    foreignKey: "UserId",
  });
  GioHang.belongsTo(Users, { as: "Id_User", foreignKey: "Id" });
  Users.hasMany(GioHang, { as: "GioHangs", foreignKey: "Id" });
  Notifications.belongsTo(Users, { as: "User", foreignKey: "UserId" });
  Users.hasMany(Notifications, { as: "Notifications", foreignKey: "UserId" });
  Orders.belongsTo(Users, { as: "User", foreignKey: "UserId" });
  Users.hasMany(Orders, { as: "Orders", foreignKey: "UserId" });
  UserVouchers.belongsTo(Users, { as: "User", foreignKey: "UserId" });
  Users.hasMany(UserVouchers, { as: "UserVouchers", foreignKey: "UserId" });
  Orders.belongsTo(Vouchers, { as: "Voucher", foreignKey: "VoucherId" });
  Vouchers.hasMany(Orders, { as: "Orders", foreignKey: "VoucherId" });
  UserVouchers.belongsTo(Vouchers, { as: "Voucher", foreignKey: "VoucherId" });
  Vouchers.hasMany(UserVouchers, {
    as: "UserVouchers",
    foreignKey: "VoucherId",
  });
  // ⭐ Associations cho OrderReviews
  OrderReviews.belongsTo(Orders, { as: "Order", foreignKey: "OrderId" });
  Orders.hasMany(OrderReviews, { as: "OrderReviews", foreignKey: "OrderId" });

  OrderReviews.belongsTo(OrderDetails, {
    as: "OrderDetail",
    foreignKey: "OrderDetailId",
  });
  OrderDetails.hasMany(OrderReviews, {
    as: "OrderReviews",
    foreignKey: "OrderDetailId",
  });

  OrderReviews.belongsTo(Users, { as: "User", foreignKey: "UserId" });
  Users.hasMany(OrderReviews, { as: "OrderReviews", foreignKey: "UserId" });
  return {
    AccRole,
    Account,
    Category,
    CuaHang,
    DeliveryAddresses,
    Food,
    FoodDimensions,
    FoodIngredient,
    GioHang,
    GioHang_Topping,
    Ingredient,
    Invoice,
    InvoiceDetail,
    Notifications,
    OrderDetails,
    OrderDetails_Topping,
    OrderStatus,
    Orders,
    PaymentStatus,
    PhuongThucThanhToan,
    ShippingOrders,
    Size,
    Staff,
    TableFood,
    Topping,
    UserVouchers,
    Users,
    Vouchers,
    Warehouse,
    OrderReviews,
  };
}
module.exports = initModels;
module.exports.initModels = initModels;
module.exports.default = initModels;
