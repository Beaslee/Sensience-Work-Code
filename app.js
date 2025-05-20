// DOM ELEMENTS
const select = document.getElementById("productSelect");
const typeFilterInput = document.getElementById("typeFilter");
const complianceFilterInput = document.getElementById("complianceFilter");
const nameField = document.getElementById("prodName");
const typeField = document.getElementById("prodType");
const voltageField = document.getElementById("prodVoltage");
const temperatureField = document.getElementById("prodTemperature");
const loadField = document.getElementById("prodLoad");
const complianceField = document.getElementById("prodCompliance");
const fileField = document.getElementById("prodFile");
const detailPanel = document.getElementById("productDetails");
const tableContainer = document.getElementById("productTable");

let products = [];
let filteredProducts = [];
let thermalSpecs = [];
let tomSelectInstance;
let tcoChart, bimetallicChart, tempSensorChart;

// === HELPERS ===
function clearDetails() {
  nameField.textContent = "";
  typeField.textContent = "";
  voltageField.textContent = "";
  temperatureField.textContent = "";
  loadField.textContent = "";
  complianceField.textContent = "";
  fileField.textContent = "";
  detailPanel.style.display = "none";
}

function updateDetails(product) {
  nameField.textContent = product.name;
  typeField.textContent = product.type;
  voltageField.textContent = product.voltage;
  temperatureField.textContent = product.temperature;
  loadField.textContent = product.load;
  complianceField.textContent = product.compliance;
  fileField.innerHTML = product.filenumber
    ? `<a href="files/${product.filenumber}.xlsx" target="_blank">${product.filenumber}</a>`
    : "—";
  detailPanel.style.display = "block";
}

function updateDropdownOptions(list) {
  if (tomSelectInstance) tomSelectInstance.destroy();
  select.innerHTML = "";

  const groups = {};
  list.forEach(product => {
    if (!groups[product.type]) groups[product.type] = [];
    groups[product.type].push(product);
  });

  Object.keys(groups).forEach(type => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = type;
    groups[type].forEach(product => {
      const option = document.createElement("option");
      option.value = product.name;
      option.textContent = product.name;
      optgroup.appendChild(option);
    });
    select.appendChild(optgroup);
  });

  tomSelectInstance = new TomSelect("#productSelect", {
    maxItems: null,
    placeholder: "Select products",
    allowEmptyOption: true,
    closeAfterSelect: false
  });
}

function renderProductTable(products) {
  if (!products.length || products.length < 2) {
    tableContainer.innerHTML = "";
    return;
  }

  let html = '<button id="downloadTableBtn">Download Table as CSV</button>';
  html += `<table><tbody>`;
  products.forEach(p => {
    html += `
      <tr><th>Name</th><td>${p.name}</td></tr>
      <tr><th>Type</th><td>${p.type}</td></tr>
      <tr><th>Voltage</th><td>${p.voltage}</td></tr>
      <tr><th>Load</th><td>${p.load}</td></tr>
      <tr><th>Temperature</th><td>${p.temperature}</td></tr>
      <tr><th>Compliance</th><td>${p.compliance}</td></tr>
      <tr><th>File Number</th><td>${p.filenumber || p.file || ""}</td></tr>
      <tr><td colspan="2"><hr></td></tr>
    `;
  });
  html += `</tbody></table>`;
  tableContainer.innerHTML = html;

  document.getElementById("downloadTableBtn").addEventListener("click", () => {
    const rows = [["Name", "Type", "Voltage", "Load", "Temperature", "Compliance", "File Number"]];
    products.forEach(p => {
      rows.push([
        p.name || "", p.type || "", p.voltage || "", p.load || "",
        p.temperature || "", p.compliance || "", p.filenumber || p.file || ""
      ]);
    });
    const csv = rows.map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "product_comparison.csv";
    link.click();
  });
}

// === CHARTS ===
function drawTcoScatterPlot() {
  const ctx = document.getElementById("tcoScatterChart").getContext("2d");
  if (tcoChart) tcoChart.destroy();

  const tfKey = Object.keys(thermalSpecs[0]).find(k => k.toLowerCase().includes("tf"));
  const tempKeys = Object.keys(thermalSpecs[0]).filter(k =>
    k.toLowerCase().includes("tm") || k.toLowerCase().includes("th")
  );

  const datasets = tempKeys.map(field => {
    const data = thermalSpecs.map(row => {
      const x = parseFloat(row[tfKey]);
      const y = parseFloat(row[field]);
      return !isNaN(x) && !isNaN(y) ? { x, y } : null;
    }).filter(p => p !== null);

    return {
      label: field,
      data,
      showLine: false,
      pointRadius: 4
    };
  });

  tcoChart = new Chart(ctx, {
    type: "scatter",
    data: { datasets },
    options: {
      plugins: {
        tooltip: { mode: "nearest" },
        legend: { display: true }
      },
      scales: {
        x: { title: { display: true, text: "tf (°C)" } },
        y: { title: { display: true, text: "Trip Temp (°C)" } }
      }
    }
  });
}

function drawBimetallicScatterPlot(mode = "voltage-temperature") {
  const ctx = document.getElementById("bimetallicScatterChart").getContext("2d");
  if (bimetallicChart) bimetallicChart.destroy();

  const isIndexMode = mode === "index-temperature";
  const [xKey, yKey] = {
    "voltage-temperature": ["voltage", "temperature"],
    "voltage-load": ["voltage", "load"],
    "load-temperature": ["load", "temperature"],
    "index-temperature": ["index", "temperature"]
  }[mode];

  const datasets = filteredProducts
    .filter(p => p.type?.toLowerCase() === "bimetallic")
    .map((p, i) => {
      const x = isIndexMode ? i + 1 : parseFloat(p[xKey]?.toString().replace(/[^\d.]/g, ""));
      const y = parseFloat(p[yKey]?.toString().replace(/[^\d.]/g, ""));
      return (!isNaN(x) && !isNaN(y)) ? {
        label: p.name,
        data: [{ x, y }],
        showLine: false,
        pointRadius: 5
      } : null;
    })
    .filter(p => p !== null);

  bimetallicChart = new Chart(ctx, {
    type: "scatter",
    data: { datasets },
    options: {
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => {
              const { x, y } = ctx.raw;
              return `(${x}, ${y})`;
            }
          }
        },
        legend: { display: true }
      },
      scales: {
        x: { title: { display: true, text: isIndexMode ? "Index" : xKey } },
        y: { title: { display: true, text: yKey } }
      }
    }
  });
}

function drawTemperatureSensorPlot() {
  const ctx = document.getElementById("tempSensorChart").getContext("2d");
  if (tempSensorChart) tempSensorChart.destroy();

  const data = filteredProducts
    .filter(p => p.type?.toLowerCase() === "temperature sensor")
    .map((p, i) => {
      const y = parseFloat(p.temperature?.toString().replace(/[^\d.]/g, ""));
      return !isNaN(y) ? {
        label: p.name,
        data: [{ x: i + 1, y }],
        showLine: false,
        pointRadius: 5
      } : null;
    }).filter(p => p !== null);

  tempSensorChart = new Chart(ctx, {
    type: "scatter",
    data: { datasets: data },
    options: {
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => {
              const { x, y } = ctx.raw;
              return `(${x}, ${y})`;
            }
          }
        },
        legend: { display: true }
      },
      scales: {
        x: { title: { display: true, text: "Index" }, beginAtZero: true },
        y: { title: { display: true, text: "Max Temperature (°F)" }, beginAtZero: true }
      }
    }
  });
}

// === CONTROLS ===
function toggleSection(sectionId) {
  const section = document.getElementById(sectionId);
  section.classList.toggle("active");
}

function downloadChart(canvasId, filename) {
  const canvas = document.getElementById(canvasId);
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = filename;
  link.click();
}

function filterProducts() {
  const typeTerm = typeFilterInput.value.trim().toLowerCase();
  const complianceTerm = complianceFilterInput.value.trim().toLowerCase();

  filteredProducts = products.filter(p => {
    const matchesType = !typeTerm || p.type?.toLowerCase().includes(typeTerm);
    const matchesCompliance = !complianceTerm || p.compliance?.toLowerCase().includes(complianceTerm);
    return matchesType && matchesCompliance;
  });

  updateDropdownOptions(filteredProducts);
  clearDetails();
  renderProductTable([]);
  drawTcoScatterPlot();
  drawBimetallicScatterPlot(document.getElementById("bimetallicAxisSelect").value);
  drawTemperatureSensorPlot();
}

select.addEventListener("change", () => {
  const selectedNames = Array.from(select.selectedOptions).map(opt => opt.value);
  const selected = filteredProducts.filter(p => selectedNames.includes(p.name));

  if (selected.length === 1) {
    updateDetails(selected[0]);
    renderProductTable([]);
  } else {
    clearDetails();
    renderProductTable(selected);
  }
});

document.getElementById("bimetallicAxisSelect").addEventListener("change", e => {
  drawBimetallicScatterPlot(e.target.value);
});

typeFilterInput.addEventListener("input", filterProducts);
complianceFilterInput.addEventListener("input", filterProducts);

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".chart-section").forEach(s => s.classList.remove("active"));

    tab.classList.add("active");
    const target = tab.dataset.tab;
    document.getElementById(target).classList.add("active");
    localStorage.setItem("activeTab", target);
  });
});

window.addEventListener("DOMContentLoaded", () => {
  const savedTab = localStorage.getItem("activeTab");
  if (savedTab) {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".chart-section").forEach(s => s.classList.remove("active"));
    document.querySelector(`.tab[data-tab="${savedTab}"]`)?.classList.add("active");
    document.getElementById(savedTab)?.classList.add("active");
  }
});

async function loadExcelFile(path) {
  const response = await fetch(path);
  const arrayBuffer = await response.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const sheet1 = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const sheet2 = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[1]]);
  products = sheet1;
  thermalSpecs = sheet2;
  filteredProducts = [...products];
  updateDropdownOptions(filteredProducts);
  drawTcoScatterPlot();
  drawBimetallicScatterPlot();
  drawTemperatureSensorPlot();
}

loadExcelFile("products.xlsx");
