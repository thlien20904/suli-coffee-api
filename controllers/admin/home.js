document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await fetch("/api/admin/home/data", {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });

    if (response.status === 401) {
      window.location.href = "/pages/signin.html";
      return;
    }

    const data = await response.json();

    // 1. Thống kê tổng quan
    document.getElementById("totalProducts").textContent = data.totalProducts;
    document.getElementById("totalIngredients").textContent =
      data.totalIngredients;
    document.getElementById("totalOrders").textContent = data.totalOrders;
    document.getElementById("totalSales").textContent =
      data.totalSales.toLocaleString("vi-VN") + " VND";

    // 2. Thống kê trạng thái đơn hàng
    document.getElementById("placedOrders").textContent = data.placedOrders;
    document.getElementById("preparingOrders").textContent =
      data.preparingOrders;
    document.getElementById("shippingOrders").textContent = data.shippingOrders;
    document.getElementById("completedOrders").textContent =
      data.completedOrders;

    // 3. Biểu đồ doanh thu vs ngân sách
    const monthlyLabels = [
      "Tháng 1",
      "Tháng 2",
      "Tháng 3",
      "Tháng 4",
      "Tháng 5",
      "Tháng 6",
      "Tháng 7",
      "Tháng 8",
      "Tháng 9",
      "Tháng 10",
      "Tháng 11",
      "Tháng 12",
    ];
    const budgetVsSalesChart = new Chart(
      document.getElementById("budgetVsSalesChart"),
      {
        type: "line",
        data: {
          labels: monthlyLabels,
          datasets: [
            {
              label: "Doanh thu",
              data: data.monthlySales.map((m) => m.totalRevenue),
              borderColor: "rgba(54, 162, 235, 1)",
              backgroundColor: "rgba(54, 162, 235, 0.2)",
              fill: true,
            },
            {
              label: "Ngân sách",
              data: data.monthlyBudget.map((m) => m.budget),
              borderColor: "rgba(255, 99, 132, 1)",
              backgroundColor: "rgba(255, 99, 132, 0.2)",
              fill: true,
            },
          ],
        },
        options: {
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: "Số tiền (VND)",
              },
            },
            x: {
              title: {
                display: true,
                text: "Tháng",
              },
            },
          },
        },
      }
    );

    // 4. Sản phẩm bán chạy
    const bestSellersContainer = document.getElementById("best-sellers");
    bestSellersContainer.innerHTML =
      data.bestSellers.length > 0
        ? data.bestSellers
            .map(
              (item) => `
            <div class="col-md-4 mb-3">
                <div class="card text-center p-3 bg-light">
                    <img src="${
                      item.imageUrl || "/Images/no-image.png"
                    }" style="max-width: 100%; height: auto; display: block;" />
                    <h5>${item.foodName}</h5>
                    <p class="price" style="color: #C19A6B; font-weight: bold;">${item.price.toLocaleString(
                      "vi-VN"
                    )}đ</p>
                    <p class="sold">Đã bán: ${item.totalSold}</p>
                </div>
            </div>
        `
            )
            .join("")
        : '<p class="text-center text-danger">Không có dữ liệu</p>';

    // 5. Top quốc gia
    const topCountriesContainer = document.getElementById("top-countries");
    topCountriesContainer.innerHTML =
      data.topCountries.length > 0
        ? data.topCountries
            .map(
              (country) => `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                ${country.country}
                <span class="badge bg-primary rounded-pill">${country.orderCount}</span>
            </li>
        `
            )
            .join("")
        : '<li class="list-group-item text-center">Không có dữ liệu</li>';

    // 6. Đơn hàng gần đây
    const recentOrdersContainer = document.getElementById("recent-orders");
    recentOrdersContainer.innerHTML =
      data.recentOrders.length > 0
        ? data.recentOrders
            .map(
              (order) => `
            <tr>
                <td>${order.orderId}</td>
                <td>${order.fullName}</td>
                <td>${order.status}</td>
                <td>${new Date(order.orderDate).toLocaleString("vi-VN", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}</td>
                <td>${order.totalAmount.toLocaleString("vi-VN")}đ</td>
            </tr>
        `
            )
            .join("")
        : '<tr><td colspan="5" class="text-center">Không có dữ liệu</td></tr>';

    // 7. Nguyên liệu sắp hết
    const lowStockContainer = document.getElementById("low-stock");
    lowStockContainer.innerHTML =
      data.lowStockIngredients.length > 0
        ? data.lowStockIngredients
            .map(
              (item) => `
            <tr>
                <td><img src="${item.imageUrl}" alt="${item.ingredientName}" style="width:50px; height:50px; object-fit:cover;"></td>
                <td>${item.ingredientName}</td>
                <td>${item.soLuong}</td>
            </tr>
        `
            )
            .join("")
        : '<tr><td colspan="3" class="text-center">Không có dữ liệu</td></tr>';
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
  }
});
