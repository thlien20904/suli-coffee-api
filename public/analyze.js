document.addEventListener("DOMContentLoaded", () => {
  // Check if Chart.js loaded; if not, show a friendly notice but continue with a fallback
  const CHART_AVAILABLE = typeof Chart !== "undefined";
  if (!CHART_AVAILABLE) {
    console.warn(
      "Chart.js not found. The analyzer will use a lightweight SVG fallback for the Pass/Fail pie."
    );
    const notice = document.createElement("div");
    notice.style.color = "orange";
    notice.style.margin = "12px 0";
    notice.textContent =
      "Cảnh báo: Chart.js không tải được. Pie Pass/Fail sẽ sử dụng chế độ dự phòng.";
    document.body.insertBefore(notice, document.body.firstChild);
  }
  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}`);
    return res.json();
  }

  function countBy(logs, key) {
    const map = {};
    logs.forEach((l) => {
      const k = l[key] || "unknown";
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }

  function renderBar(ctxId, title, dataMap, color) {
    const ctx = document.getElementById(ctxId).getContext("2d");
    return new Chart(ctx, {
      type: "bar",
      data: {
        labels: Object.keys(dataMap),
        datasets: [
          {
            label: title,
            data: Object.values(dataMap),
            backgroundColor: color,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          title: { display: true, text: title },
        },
        scales: { y: { beginAtZero: true } },
      },
    });
  }

  function renderPie(ctxId, title, labels, values, colors) {
    if (CHART_AVAILABLE) {
      const ctx = document.getElementById(ctxId).getContext("2d");
      return new Chart(ctx, {
        type: "pie",
        data: {
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: colors,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: "bottom" },
            title: { display: true, text: title },
          },
        },
      });
    }
    // If Chart isn't available, fall back to SVG renderer
    return renderPieFallback(ctxId, title, labels, values, colors);
  }

  // Lightweight SVG fallback for a pie chart (works for any number of slices)
  function renderPieFallback(canvasId, title, labels, values, colors) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    // create container
    const w = canvas.width || 380;
    const h = canvas.height || 300;
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2) - 10;
    const r = Math.min(w, h) * 0.22; // radius

    const total = values.reduce((s, v) => s + (Number(v) || 0), 0) || 1;
    let angle = -Math.PI / 2; // start at top

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    svg.style.display = "block";
    svg.style.margin = "0 auto";

    // Title
    const titleEl = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text"
    );
    titleEl.setAttribute("x", cx);
    titleEl.setAttribute("y", 20);
    titleEl.setAttribute("text-anchor", "middle");
    titleEl.setAttribute("font-size", "14");
    titleEl.setAttribute("fill", "#213547");
    titleEl.textContent = title;
    svg.appendChild(titleEl);

    // Draw slices
    values.forEach((v, i) => {
      const frac = (Number(v) || 0) / total;
      const end = angle + frac * Math.PI * 2;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(end);
      const y2 = cy + r * Math.sin(end);
      const large = end - angle > Math.PI ? 1 : 0;
      const pathD = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      path.setAttribute("d", pathD);
      path.setAttribute("fill", colors[i] || "#ccc");
      svg.appendChild(path);
      angle = end;
    });

    // Legend
    const legendX = 20;
    let legendY = h - 60;
    labels.forEach((lbl, i) => {
      const rect = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect"
      );
      rect.setAttribute("x", legendX);
      rect.setAttribute("y", legendY - 12);
      rect.setAttribute("width", 12);
      rect.setAttribute("height", 12);
      rect.setAttribute("fill", colors[i] || "#ccc");
      svg.appendChild(rect);
      const text = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      text.setAttribute("x", legendX + 20);
      text.setAttribute("y", legendY - 2);
      text.setAttribute("font-size", "12");
      text.setAttribute("fill", "#333");
      const pct = Math.round(((Number(values[i]) || 0) / total) * 100);
      text.textContent = `${lbl} — ${values[i]} (${pct}%)`;
      svg.appendChild(text);
      legendY += 18;
    });

    // Replace canvas with svg (keep canvas in DOM for other code if needed)
    canvas.style.display = "none";
    if (canvas.parentNode) canvas.parentNode.appendChild(svg);
    return svg;
  }

  async function loadAllCharts() {
    try {
      const failLogs = await fetchJSON("/api/logs");
      if (!failLogs || failLogs.length === 0) {
        document.body.insertAdjacentHTML(
          "beforeend",
          "<p>⚠️ Chưa có báo cáo vi phạm nào để phân tích.</p>"
        );
      } else {
        renderBar(
          "byPage",
          "Vi phạm theo trang (document-uri)",
          countBy(failLogs, "document-uri"),
          "rgba(75, 192, 192, 0.7)"
        );
        renderBar(
          "byDirective",
          "Vi phạm theo directive",
          countBy(failLogs, "violated-directive"),
          "rgba(255, 159, 64, 0.7)"
        );
        renderBar(
          "byBlocked",
          "Vi phạm theo blocked-uri",
          countBy(failLogs, "blocked-uri"),
          "rgba(153, 102, 255, 0.7)"
        );
      }

      const { fail, pass } = await fetchJSON("/api/logs-full");
      console.log(
        "Analyzer: fail/pass counts",
        (fail || []).length,
        (pass || []).length
      );

      // Update text summary
      const infoEl = document.getElementById("passFailInfo");
      infoEl.textContent = `Fail: ${(fail || []).length}  —  Pass: ${
        (pass || []).length
      }`;

      renderPie(
        "passFail",
        "Thống kê Pass / Fail",
        ["Fail", "Pass"],
        [(fail || []).length, (pass || []).length],
        ["#ff6384", "#36a2eb"]
      );
    } catch (err) {
      console.error("Error loading charts:", err);
    }
  }

  loadAllCharts();
});
