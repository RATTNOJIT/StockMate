(() => {
  const config = window.STOCKMATE_CONFIG || {};
  const client = window.supabase && config.supabaseUrl && config.supabasePublishableKey
    ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey) : null;
  const KEY = "stockmate-inventory-v3";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const empty = { products: [], history: [], unitsSold: 0 };
  let state;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    state = saved && Array.isArray(saved.products) && Array.isArray(saved.history) ? { ...empty, ...saved } : { ...empty };
  } catch { state = { ...empty }; }
  const now = new Date();
  const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  if (state.period !== periodKey) {
    if (state.period) {
      state.products.forEach(product => {
        const closing = Number(product.availableStock ?? product.stock) || 0;
        product.previousStock = closing;
        product.newStock = 0;
        product.totalStock = closing;
        product.sales = 0;
        product.availableStock = closing;
      });
      state.unitsSold = 0;
    } else {
      state.products.forEach(product => {
        const entries = state.history.filter(item => item.code === product.code).sort((a,b) => new Date(a.date) - new Date(b.date));
        const prior = entries.filter(item => new Date(item.date) < monthStart);
        const current = entries.filter(item => new Date(item.date) >= monthStart);
        const closing = prior.length ? Number(prior[prior.length - 1].after) || 0 : Number(product.previousStock) || 0;
        product.previousStock = closing;
        product.newStock = current.reduce((sum,item) => sum + (Number(item.newStock) || 0), 0);
        product.totalStock = closing + product.newStock;
        product.sales = current.reduce((sum,item) => sum + (Number(item.sales) || 0), 0);
        product.availableStock = Number(product.availableStock ?? product.stock ?? (current.length ? current[current.length - 1].after : product.totalStock - product.sales)) || 0;
      });
      state.unitsSold = state.products.reduce((sum,product) => sum + (Number(product.sales) || 0), 0);
    }
    state.period = periodKey;
  }

  const safe = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { toast("Could not save data in this browser."); } };
  function toast(message) { const el = $("#toast"); el.textContent = message; el.classList.add("visible"); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("visible"), 3000); }
  const status = product => product.stock <= 0 ? "Out of stock" : product.stock <= (Number(product.reorder) || 5) ? "Low stock" : "In stock";

  async function protectPage() {
    if (!client) { location.replace("index.html"); return; }
    try {
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError || !user) { location.replace("index.html"); return; }
      const { data: admin, error } = await client.from("admins").select("id").eq("id", user.id).maybeSingle();
      if (error || !admin) { await client.auth.signOut(); location.replace("index.html"); return; }
      const email = user.email || "Admin account";
      $("#profileEmail").textContent = email;
      $("#profileName").textContent = email.split("@")[0] || "Administrator";
      $("#avatar").textContent = (email[0] || "A").toUpperCase();
      document.body.classList.remove("auth-pending");
    } catch { location.replace("index.html"); }
  }
  protectPage();
  $("#profileButton").addEventListener("click", async () => { if (client) await client.auth.signOut(); location.replace("index.html"); });
  $("#todayLabel").textContent = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date());

  function setView(name) {
    $$(".dashboard-view").forEach(view => view.classList.toggle("active", view.id === name));
    $$(".main-nav .nav-item").forEach(link => {
      const active = link.getAttribute("href") === `#${name}`;
      link.classList.toggle("active", active);
      active ? link.setAttribute("aria-current", "page") : link.removeAttribute("aria-current");
    });
    const navLabel = $(".main-content .breadcrumbs strong");
    if (navLabel) navLabel.textContent = ({ "overview-view": "Overview", "update-sales": "Update Sales", "stock-history": "Stock History", reports: "Reports", "product-list": "Product List", "product-details": "Product Details" })[name] || "Overview";
    $("#sidebar").classList.remove("open");
  }
  $$(".main-nav .nav-item").forEach(link => link.addEventListener("click", event => { event.preventDefault(); setView(link.getAttribute("href").slice(1)); }));
  $$(".overview-shortcuts a").forEach(link => link.addEventListener("click", event => { event.preventDefault(); setView(link.getAttribute("href").slice(1)); }));
  $("#overview-view .activity-link").addEventListener("click", event => { event.preventDefault(); setView("stock-history"); });
  $("#menuButton").addEventListener("click", () => $("#sidebar").classList.toggle("open"));

  // Replace all placeholder rows and figures with an empty, live-rendered state.
  const metricValues = $$(".metric-value");
  $$(".metric-label").forEach((label, index) => { label.textContent = ["Total Products", "Total Stock", "Total Sales", "Available Stock"][index] || label.textContent; });
  $$(".metric-foot").forEach((label, index) => { label.textContent = ["Products in your list", "Units received", "Units sold", "Units on hand"][index] || label.textContent; });
  metricValues[0].id = "totalProducts"; metricValues[1].id = "totalStock"; metricValues[2].id = "totalSales"; metricValues[3].id = "availableStock";
  const salesIcon = $(".metric-icon", metricValues[2].closest(".metric-card"));
  if (salesIcon) salesIcon.textContent = "↗";
  $("#productRows").replaceChildren();
  const notice = $("#overview-view .preview-note");
  if (notice) notice.innerHTML = `<span class="preview-dot"></span><span>Inventory changes are saved in this browser.</span>`;
  const activityList = $(".activity-list");
  const healthPanel = $(".stock-panel");
  const donut = $(".donut", healthPanel);
  const healthNumbers = $$(".health-legend strong", healthPanel);
  const totalLabel = $(".donut strong", healthPanel);
  const healthTip = $(".health-tip", healthPanel);
  const search = $("#productSearch");
  const reportPeriod = $("#reportPeriod");
  const reportMonth = $("#reportMonth");

  reportMonth.value = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`;
  // Turn the product connection notice into a real add-product form.
  const modal = $("#modalBackdrop .modal");
  modal.innerHTML = `<button class="modal-close" id="closeModal" type="button" aria-label="Close">×</button><span class="modal-mark">＋</span><h2 id="modalTitle">Add product</h2><p>Add a product with its code, unit and opening quantity.</p><form id="productForm" class="product-form"><label>Product Code<input id="newCode" required maxlength="40" placeholder="Product code"></label><label>Product Name<input id="newName" required maxlength="80" placeholder="Product name"></label><label>Unit<select id="newUnit"><option>Piece</option><option>Box</option><option>Pack</option><option>Kg</option><option>Gram</option><option>Litre</option><option>Meter</option><option>Set</option><option>Other</option></select></label><label>Opening Stock<input id="newStock" type="number" min="0" step="1" required value="0"></label><label>Invoice Number<input id="newInvoiceNumber" type="text" maxlength="60" placeholder="Enter invoice number"></label><button class="primary-button modal-button" type="submit">Save product</button></form>`;
  $("#closeModal").addEventListener("click", () => { $("#modalBackdrop").hidden = true; });
  $("#modalBackdrop").addEventListener("click", event => { if (event.target === $("#modalBackdrop")) $("#modalBackdrop").hidden = true; });
  document.addEventListener("keydown", event => { if (event.key === "Escape") $("#modalBackdrop").hidden = true; });

  const stockForm = $("#stockEditForm");
  const salesPanel = $(".sales-entry-panel");
  const toggleSalesForm = $("#toggleSalesForm");
  const setSalesFormExpanded = expanded => {
    salesPanel.classList.toggle("expanded", expanded);
    toggleSalesForm.setAttribute("aria-expanded", String(expanded));
    toggleSalesForm.textContent = expanded ? "Close Entry" : "＋ Add / Update Product";
  };
  toggleSalesForm.addEventListener("click", () => setSalesFormExpanded(!salesPanel.classList.contains("expanded")));
  const salesCode = $("#salesProductCode");
  const salesName = $("#salesProductName");
  let editingProductId = null;
  const loadProduct = product => {
    editingProductId = product.id;
    salesCode.value = product.code;
    salesName.value = product.name;
    $("#salesPreviousStock").value = Number(product.previousStock) || 0;
    $("#salesNewStock").value = Number(product.newStock) || 0;
    $("#salesUnit").value = product.unit || "Piece";
    $("#salesQuantity").value = Number(product.sales) || 0;
    $("#salesHsnCode").value = product.hsnCode || "";
    $("#salesInvoiceNumber").value = "";
    $("#salesFormHint").textContent = "Previous Stock is the closing available stock from last month. Every field can be edited.";
    $("#salesFormHint").classList.remove("form-error");
  };
  const updateSalesPreview = () => {
    const previous = Math.max(0, Number($("#salesPreviousStock").value) || 0);
    const incoming = Math.max(0, Math.floor(Number($("#salesNewStock").value) || 0));
    const sales = Math.max(0, Math.floor(Number($("#salesQuantity").value) || 0));
    const total = previous + incoming;
    const available = Math.max(0, total - sales);
    const hint = $("#salesFormHint");
    hint.textContent = sales > total ? `Sales exceed total stock. Total Stock: ${total} ${$("#salesUnit").value}.` : `Calculated — Total Stock: ${total} ${$("#salesUnit").value}; Available Stock: ${available} ${$("#salesUnit").value}.`;
    hint.classList.toggle("form-error", sales > total);
  };
  const clearSalesForm = () => {
    stockForm.reset();
    editingProductId = null;
    $("#salesPreviousStock").value = 0;
    $("#salesNewStock").value = 0;
    $("#salesQuantity").value = 0;
    $("#salesUnit").value = "Piece";
    updateSalesPreview();
  };
  const findCodeMatch = () => {
    const code = salesCode.value.trim().toLowerCase();
    const match = state.products.find(product => product.code.toLowerCase() === code);
    if (match && match.id !== editingProductId) { loadProduct(match); return; }
    if (!match && !editingProductId) {
      $("#salesPreviousStock").value = 0; $("#salesNewStock").value = 0;
      $("#salesQuantity").value = 0; $("#salesUnit").value = "Piece";
    }
    updateSalesPreview();
  };
  salesCode.addEventListener("change", findCodeMatch);
  salesCode.addEventListener("blur", findCodeMatch);
  ["#salesPreviousStock", "#salesNewStock", "#salesQuantity"].forEach(selector => $(selector).addEventListener("input", updateSalesPreview));

  function renderProducts() {
    const headers = `<tr><th>PRODUCT CODE</th><th>PRODUCT NAME</th><th>PREVIOUS STOCK</th><th>NEW STOCK</th><th>TOTAL STOCK</th><th>UNIT</th><th>SALES</th><th>AVAILABLE STOCK</th><th>ACTION</th></tr>`;
    $("#product-list thead").innerHTML = headers;
    const query = search.value.trim().toLowerCase();
    const filtered = state.products.filter(p => `${p.code} ${p.name} ${p.category}`.toLowerCase().includes(query));
    $("#productRows").innerHTML = filtered.map(p => {
      const previous = Number(p.previousStock) || 0, incoming = Number(p.newStock) || 0, total = Number(p.totalStock) || 0, sold = Number(p.sales) || 0, available = Number(p.availableStock) || 0;
      return `<tr><td data-label="Product Code" class="sku">${safe(p.code)}</td><td data-label="Product Name"><strong class="product-name-cell">${safe(p.name)}</strong></td><td data-label="Previous Stock">${previous} ${safe(p.unit || "Piece")}</td><td data-label="New Stock">${incoming} ${safe(p.unit || "Piece")}</td><td data-label="Total Stock"><strong>${total}</strong> ${safe(p.unit || "Piece")}</td><td data-label="Unit">${safe(p.unit || "Piece")}</td><td data-label="Sales">${sold} ${safe(p.unit || "Piece")}</td><td data-label="Available Stock"><strong>${available}</strong> ${safe(p.unit || "Piece")}</td><td data-label="Action"><button class="row-more edit-stock-link" type="button" data-code="${safe(p.code)}">Update</button></td></tr>`;
    }).join("");
    const emptyState = $("#emptyState");
    if (emptyState) { emptyState.hidden = filtered.length > 0; emptyState.textContent = state.products.length ? "No products match your search." : "No products yet. Add your first product."; }
    const shown = $("#shownCount"); if (shown) shown.textContent = filtered.length;
    const footer = $(".table-footer span"); if (footer) footer.innerHTML = `Showing <strong>${filtered.length}</strong> product${filtered.length === 1 ? "" : "s"}`;
    const salesQuery = $("#salesProductSearch").value.trim().toLowerCase();
    const salesProducts = state.products.filter(p => `${p.code} ${p.name}`.toLowerCase().includes(salesQuery));
    const updateRows = $("#salesProductRows");
    updateRows.innerHTML = salesProducts.map(p => `<tr><td data-label="Product Code" class="sku">${safe(p.code)}</td><td data-label="Product Name"><strong class="product-name-cell">${safe(p.name)}</strong></td><td data-label="Previous Stock">${Number(p.previousStock) || 0} ${safe(p.unit || "Piece")}</td><td data-label="New Stock">${Number(p.newStock) || 0} ${safe(p.unit || "Piece")}</td><td data-label="Total Stock"><strong>${Number(p.totalStock) || 0}</strong> ${safe(p.unit || "Piece")}</td><td data-label="Unit">${safe(p.unit || "Piece")}</td><td data-label="Sales">${Number(p.sales) || 0} ${safe(p.unit || "Piece")}</td><td data-label="Available Stock"><strong>${Number(p.availableStock) || 0}</strong> ${safe(p.unit || "Piece")}</td><td data-label="Action"><button class="row-more edit-stock-link" type="button" data-code="${safe(p.code)}">Update</button></td></tr>`).join("");
    const salesEmpty = $("#salesProductsEmpty"); if (salesEmpty) { salesEmpty.hidden = salesProducts.length > 0; salesEmpty.textContent = state.products.length ? "No products match your search." : "No products yet. Add the first product above."; }
    $$(".edit-stock-link").forEach(button => button.addEventListener("click", () => { const product = state.products.find(p => p.code === button.dataset.code); if (product) { loadProduct(product); setSalesFormExpanded(true); } setView("update-sales"); }));
  }
  const localDateValue = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  let currentHistoryDay = localDateValue(new Date());
  function renderHistory() {
    const headings = $$("#stock-history thead th");
    ["DATE & TIME", "PRODUCT", "ACTIVITY", "CHANGE", "STOCK AFTER", "INVOICE NUMBER"].forEach((label, index) => { if (headings[index]) headings[index].textContent = label; });
    const tbody = $("#stock-history tbody");
    const historyDateInput=$("#historyDateFilter");
    if(!historyDateInput.value) historyDateInput.value=currentHistoryDay;
    const selectedDate = historyDateInput.value;
    const items = [...state.history]
      .filter(item => !selectedDate || (() => { const date = new Date(item.date); const localDate = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; return localDate === selectedDate; })())
      .sort((a,b) => new Date(b.date) - new Date(a.date));
    tbody.innerHTML = items.map(item => {
      const date = new Date(item.date); const change = Number(item.change) || 0;
      const type = Number(item.sales) > 0 ? "Sales updated" : Number(item.newStock) > 0 ? "Stock received" : "Stock corrected";
      const movement = `+${Number(item.newStock) || 0} / −${Number(item.sales) || 0} ${safe(item.unit || "Piece")}`;
      return `<tr><td>${date.toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}</td><td><strong>${safe(item.name)}</strong><small class="table-subline">${safe(item.code)}</small></td><td>${type}</td><td class="${change > 0 ? "qty-plus" : change < 0 ? "qty-minus" : ""}">${movement}</td><td>${Number(item.after) || 0} ${safe(item.unit || "Piece")}</td><td>${safe(item.invoiceNumber || "—")}</td></tr>`;
    }).join("");
    let empty = $("#historyEmpty");
    if (!empty) { empty = document.createElement("div"); empty.id = "historyEmpty"; empty.className = "empty-state"; empty.textContent = "No stock history yet."; $("#stock-history .table-wrap").append(empty); }
    empty.hidden = items.length > 0;
    const footer = $(".history-foot", $("#stock-history"));
    if (footer) footer.textContent = selectedDate ? `${items.length} update${items.length === 1 ? "" : "s"} on ${selectedDate}` : `${items.length} stock update${items.length === 1 ? "" : "s"}`;
  }
  $("#historyDateFilter").addEventListener("input", renderHistory);
  function refreshHistoryDay(){
    const today=localDateValue(new Date());
    if(today===currentHistoryDay)return;
    const input=$("#historyDateFilter");
    if(!input.value||input.value===currentHistoryDay)input.value=today;
    currentHistoryDay=today;
    $("#todayLabel").textContent=new Intl.DateTimeFormat("en",{weekday:"short",month:"short",day:"numeric",year:"numeric"}).format(new Date());
    renderHistory();
  }
  window.setInterval(refreshHistoryDay,30000);
  window.addEventListener("focus",refreshHistoryDay);
  window.addEventListener("pageshow",refreshHistoryDay);
  $("#clearHistoryDate").addEventListener("click", () => { $("#historyDateFilter").value = localDateValue(new Date()); renderHistory(); });
  let selectedReportProductCode = "";
  function renderReports() {
    const range = reportPeriod.value;
    const monthKey = reportMonth.value;
    const [monthYear,monthNumber] = monthKey.split("-").map(Number);
    const monthHistory = state.history.filter(item => { const date=new Date(item.date); return date.getFullYear()===monthYear && date.getMonth()+1===monthNumber; });
    $("#salesMonthLabel").textContent = new Date(monthYear,monthNumber-1,1).toLocaleDateString("en",{month:"long",year:"numeric"});
    const today = new Date(); today.setHours(0,0,0,0);
    const start = new Date(today);
    if (range === "7days") start.setDate(start.getDate() - 6);
    else if (range === "30days") start.setDate(start.getDate() - 29);
    else start.setDate(1);
    const snapshots = new Map();
    const periodMovements = [];
    [...state.history].sort((a,b)=>new Date(a.date)-new Date(b.date)).forEach(item => {
      const itemDate=new Date(item.date); const day=new Date(itemDate); day.setHours(0,0,0,0);
      const month=`${itemDate.getFullYear()}-${itemDate.getMonth()}`;
      const key=`${item.code}|${month}`;
      const previous=snapshots.get(key)||{received:0,sold:0};
      const current={received:Number(item.newStock)||0,sold:Number(item.sales)||0};
      if(day>=start && day<=today) periodMovements.push({day,received:current.received-previous.received,sold:current.sold-previous.sold});
      snapshots.set(key,current);
    });
    const received=Math.max(0,periodMovements.reduce((sum,item)=>sum+item.received,0));
    const sold=Math.max(0,periodMovements.reduce((sum,item)=>sum+item.sold,0));
    const net = received - sold;
    const summary = [
      ["Stock Received", received, "Units added during this period", "＋", "blue"],
      ["Units Sold", sold, "Units sold during this period", "↗", "green"],
      ["Net Movement", net, net >= 0 ? "More stock received than sold" : "More units sold than received", "↕", net >= 0 ? "blue" : "amber"],
      ["Products Tracked", state.products.length, "Products in your list", "▦", "purple"]
    ];
    $("#reportSummary").innerHTML = summary.map(([label,value,foot,icon,color]) => `<article class="panel report-metric"><div class="report-metric-top"><span>${label}</span><i class="${color}">${icon}</i></div><strong>${Number(value).toLocaleString("en")}<small>${label === "Products Tracked" ? "products" : "units"}</small></strong><p>${foot}</p></article>`).join("");

    const dayCount = range === "7days" ? 7 : range === "30days" ? 30 : Math.max(1, today.getDate());
    const days = Array.from({length:dayCount},(_,index) => { const date = new Date(start); date.setDate(start.getDate()+index); return date; });
    const byDay = new Map(days.map(date => [date.toDateString(),{received:0,sold:0}]));
    periodMovements.forEach(item => { const entry=byDay.get(item.day.toDateString()); if(entry){entry.received+=Math.max(0,item.received);entry.sold+=Math.max(0,item.sold);} });
    const max = Math.max(1,...[...byDay.values()].flatMap(item => [item.received,item.sold]));
    $("#movementChart").innerHTML = days.map((date,index) => { const entry=byDay.get(date.toDateString()); const label = range === "7days" || index === 0 || index === days.length-1 || index%5===0; return `<div class="movement-day"><div class="movement-bars"><i class="received-bar" title="Received ${entry.received}" style="--bar-height:${Math.max(entry.received?4:0,entry.received/max*100)}%"></i><i class="sold-bar" title="Sold ${entry.sold}" style="--bar-height:${Math.max(entry.sold?4:0,entry.sold/max*100)}%"></i></div><span>${label?date.toLocaleDateString("en",{month:"short",day:"numeric"}):""}</span></div>`; }).join("");
    $("#movementEmpty").hidden = received + sold > 0;

    const inStock=state.products.filter(p => Number(p.availableStock)> (Number(p.reorder)||5)).length;
    const lowStock=state.products.filter(p => Number(p.availableStock)>0 && Number(p.availableStock)<= (Number(p.reorder)||5)).length;
    const outStock=state.products.filter(p => Number(p.availableStock)<=0).length;
    const count=state.products.length || 1;
    $("#statusProductCount").textContent=state.products.length;
    $("#inStockCount").textContent=inStock; $("#lowStockCount").textContent=lowStock; $("#outStockCount").textContent=outStock;
    $("#inStockBar").style.width=`${inStock/count*100}%`; $("#lowStockBar").style.width=`${lowStock/count*100}%`; $("#outStockBar").style.width=`${outStock/count*100}%`;
    $("#reportProductCount").textContent=`${state.products.length} product${state.products.length===1?"":"s"}`;
    const products=[...state.products].sort((a,b)=>(Number(a.availableStock)||0)-(Number(b.availableStock)||0));
    $("#reportProductRows").innerHTML=products.map(p=>`<tr><td><strong>${safe(p.name)}</strong></td><td>${safe(p.code)}</td><td>${Number(p.previousStock)||0} ${safe(p.unit||"Piece")}</td><td>${Number(p.newStock)||0} ${safe(p.unit||"Piece")}</td><td>${Number(p.totalStock)||0} ${safe(p.unit||"Piece")}</td><td>${Number(p.sales)||0} ${safe(p.unit||"Piece")}</td><td><strong class="${Number(p.availableStock)<=0?"stock-out":Number(p.availableStock)<=(Number(p.reorder)||5)?"stock-low":"stock-ok"}">${Number(p.availableStock)||0} ${safe(p.unit||"Piece")}</strong></td></tr>`).join("");
    $("#reportProductsEmpty").hidden=products.length>0;
    const salesByCode = new Map();
    [...monthHistory].sort((a,b)=>new Date(a.date)-new Date(b.date)).forEach(item => { salesByCode.set(item.code,{sales:Number(item.sales)||0,received:Number(item.newStock)||0}); });
    const ranking=state.products.map(product=>({product,...(salesByCode.get(product.code)||{sales:0,received:0})})).sort((a,b)=>b.sales-a.sales || a.product.name.localeCompare(b.product.name));
    const selectedProduct=state.products.find(product=>product.code===selectedReportProductCode);
    const detailsMonth=$("#selectedProductMonth");
    if(!detailsMonth.value) detailsMonth.value=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`;
    const [detailsYear,detailsMonthNumber]=detailsMonth.value.split("-").map(Number);
    const selectedMonthHistory=selectedProduct?state.history.filter(item=>{const d=new Date(item.date);return item.code===selectedProduct.code&&d.getFullYear()===detailsYear&&d.getMonth()+1===detailsMonthNumber;}).sort((a,b)=>new Date(a.date)-new Date(b.date)):[];
    const selectedMonthly=selectedMonthHistory.length?selectedMonthHistory[selectedMonthHistory.length-1]:null;
    $("#selectedProductMetrics").hidden=Boolean(selectedProduct&&!selectedMonthly);
    $("#selectedProductNoResult").hidden=!(selectedProduct&&!selectedMonthly);
    $("#selectedProductSold").textContent=selectedProduct&&selectedMonthly?`${Number(selectedMonthly.sales)||0} ${selectedProduct.unit||"Piece"}`:"—";
    $("#selectedProductReceived").textContent=selectedProduct&&selectedMonthly?`${Number(selectedMonthly.newStock)||0} ${selectedProduct.unit||"Piece"}`:"—";
    $("#selectedProductAvailable").textContent=selectedProduct?`${Number(selectedProduct.availableStock)||0} ${selectedProduct.unit||"Piece"}`:"—";
    if(selectedProduct && document.activeElement!==$("#reportProductSearch")) $("#reportProductSearch").value=`${selectedProduct.name} · ${selectedProduct.code}`;
    const most=ranking[0], least=ranking[ranking.length-1];
    const hasMonthRecords=monthHistory.length>0;
    $("#topProductsEmpty").textContent=hasMonthRecords?"No products to compare yet.":"No record found for this month.";
    $("#topProductsEmpty").hidden=ranking.length>0 && hasMonthRecords;
    $("#topSellingComparison").hidden=!hasMonthRecords || ranking.length===0;
    if(most){
      $("#mostSoldName").textContent=most.product.name; $("#mostSoldCode").textContent=most.product.code;
      $("#mostSoldQuantity").textContent=most.sales; $("#mostSoldUnit").textContent=most.product.unit||"Piece";
      $("#leastSoldName").textContent=least.product.name; $("#leastSoldCode").textContent=least.product.code;
      $("#leastSoldQuantity").textContent=least.sales; $("#leastSoldUnit").textContent=least.product.unit||"Piece";
    }

  }
  reportPeriod.addEventListener("change", renderReports);
  reportMonth.addEventListener("change", renderReports);
  $("#selectedProductMonth").addEventListener("change",renderReports);
  function renderReportProductOptions() {
    const input=$("#reportProductSearch"), options=$("#reportProductOptions"), query=input.value.trim().toLowerCase();
    const matches=[...state.products].filter(product=>`${product.name} ${product.code}`.toLowerCase().includes(query)).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,50);
    options.innerHTML=matches.map(product=>`<button type="button" class="report-product-option" role="option" data-report-product="${safe(product.code)}"><strong>${safe(product.name)}</strong><small>${safe(product.code)}</small></button>`).join("");
    options.hidden=matches.length===0;
  }
  $("#reportProductSearch").addEventListener("input",()=>{selectedReportProductCode="";renderReports();renderReportProductOptions();});
  $("#reportProductSearch").addEventListener("focus",renderReportProductOptions);
  $("#reportProductSearch").addEventListener("keydown",event=>{if(event.key==="Escape")$("#reportProductOptions").hidden=true;const first=$("#reportProductOptions .report-product-option");if(event.key==="Enter"&&first){event.preventDefault();first.click();}});
  $("#reportProductOptions").addEventListener("click",event=>{const option=event.target.closest("[data-report-product]");if(!option)return;selectedReportProductCode=option.dataset.reportProduct;const product=state.products.find(item=>item.code===selectedReportProductCode);$("#reportProductSearch").value=product?`${product.name} · ${product.code}`:"";$("#reportProductOptions").hidden=true;renderReports();});
  document.addEventListener("click",event=>{if(!event.target.closest(".report-product-picker"))$("#reportProductOptions").hidden=true;});
  function renderProductDetails() {
    const query=$("#productDetailsSearch").value.trim().toLowerCase();
    const allProducts=[...state.products].sort((a,b)=>a.name.localeCompare(b.name));
    const products=allProducts.filter(product=>`${product.name} ${product.code} ${product.hsnCode||""}`.toLowerCase().includes(query));
    $("#productDetailsRows").innerHTML=products.map(product=>`<tr><td><strong>${safe(product.name)}</strong></td><td>${safe(product.code)}</td><td>${safe(product.hsnCode||"—")}</td></tr>`).join("");
    const empty=$("#productDetailsEmpty"); empty.hidden=products.length>0; empty.textContent=allProducts.length?"No products match your search.":"No product details yet.";
  }
  $("#productDetailsSearch").addEventListener("input", renderProductDetails);
  function render() {
    const count = state.products.length;
    const available = state.products.reduce((sum,p) => sum + Math.max(0, Number(p.availableStock) || 0), 0);
    const received = state.products.reduce((sum,p) => sum + (Number(p.totalStock) || 0), 0);
    state.unitsSold = state.products.reduce((sum,p) => sum + (Number(p.sales) || 0), 0);
    const healthy = state.products.filter(p => p.availableStock > (Number(p.reorder) || 5)).length;
    const low = state.products.filter(p => p.availableStock > 0 && p.availableStock <= (Number(p.reorder) || 5)).length;
    const out = state.products.filter(p => p.availableStock <= 0).length;
    $("#totalProducts").textContent = count.toLocaleString("en");
    $("#totalStock").innerHTML = `${received.toLocaleString("en")} <small>units</small>`;
    $("#totalSales").innerHTML = `${(Number(state.unitsSold) || 0).toLocaleString("en")} <small>units</small>`;
    $("#availableStock").innerHTML = `${available.toLocaleString("en")} <small>units</small>`;
    totalLabel.textContent = count.toLocaleString("en");
    healthNumbers[0].textContent = healthy.toLocaleString("en"); healthNumbers[1].textContent = low.toLocaleString("en"); healthNumbers[2].textContent = out.toLocaleString("en");
    if (count) { const a = healthy/count*100, b = low/count*100; donut.style.background = `conic-gradient(#19b981 0 ${a}%,#efa82f ${a}% ${a+b}%,#e5756b ${a+b}% 100%)`; }
    else donut.style.background = "#edf1f5";
    healthTip.textContent = count ? (low + out ? `${low + out} product${low + out === 1 ? " needs" : "s need"} attention.` : "All products are above their low-stock level.") : "Add a product to start tracking stock health.";
    const recent = [...state.history].sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,4);
    activityList.innerHTML = recent.length ? recent.map(item => { const plus = Number(item.newStock) > 0; const sale = Number(item.sales) > 0; const movement = `Received ${Number(item.newStock) || 0}, sold ${Number(item.sales) || 0} ${safe(item.unit || "Piece")}`; return `<div class="activity-item"><span class="activity-icon ${plus ? "added" : sale ? "sold" : "updated"}">${plus ? "+" : sale ? "↗" : "↻"}</span><div><p><strong>${sale ? "Sales updated" : plus ? "Stock received" : "Stock updated"}</strong><br>${safe(item.name)} · ${movement}</p><small>${new Date(item.date).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}</small></div></div>`; }).join("") : `<div class="empty-message">No stock activity yet.</div>`;
    renderProducts(); renderHistory();
    renderReports(); renderProductDetails();
  }
  search.addEventListener("input", renderProducts);
  $("#salesProductSearch").addEventListener("input", renderProducts);
  $("#productForm").addEventListener("submit", event => {
    event.preventDefault();
    const code = $("#newCode").value.trim();
    if (state.products.some(p => p.code.toLowerCase() === code.toLowerCase())) { toast("That product code is already in your product list."); return; }
    const stock = Math.max(0, Math.floor(Number($("#newStock").value) || 0));
    const product = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), code, name: $("#newName").value.trim(), category: "Uncategorized", unit: $("#newUnit").value, previousStock: 0, newStock: stock, totalStock: stock, sales: 0, availableStock: stock, received: stock, reorder: 5 };
    state.products.push(product);
    state.history.unshift({ date: new Date().toISOString(), name: product.name, code, unit: product.unit, change: stock, newStock: stock, sales: 0, after: stock, reason: "purchase", reasonLabel: "Opening stock", invoiceNumber: $("#newInvoiceNumber").value.trim() });
    save(); render(); $("#productForm").reset(); $("#modalBackdrop").hidden = true; toast("Product added.");
  });
  stockForm.addEventListener("submit", event => {
    event.preventDefault();
    const code = salesCode.value.trim();
    const name = salesName.value.trim();
    const previous = Math.max(0, Number($("#salesPreviousStock").value) || 0);
    const newStock = Math.max(0, Math.floor(Number($("#salesNewStock").value) || 0));
    const sales = Math.max(0, Math.floor(Number($("#salesQuantity").value) || 0));
    const invoiceNumber = $("#salesInvoiceNumber").value.trim();
    const hsnCode = $("#salesHsnCode").value.trim();
    const total = previous + newStock;
    const available = Math.max(0, total - sales);
    if (!code || !name) { toast("Enter a product code and name."); return; }
    if (sales > total) { toast("Sales cannot exceed total stock."); return; }
    const existing = state.products.find(p => p.id === editingProductId) || state.products.find(p => p.code.toLowerCase() === code.toLowerCase());
    if (state.products.some(p => p.code.toLowerCase() === code.toLowerCase() && p.id !== existing?.id)) { toast("That product code is already in your product list."); return; }
    const unit = $("#salesUnit").value;
    let product = existing;
    if (!product) {
      product = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), code, name, category: "Uncategorized", unit, hsnCode, previousStock: previous, newStock, totalStock: total, sales, availableStock: available, received: newStock, reorder: 5 };
      state.products.push(product);
    } else {
      product.code = code;
      product.name = name;
      product.previousStock = previous;
      product.newStock = newStock;
      product.totalStock = total;
      product.sales = sales;
      product.availableStock = available;
      product.stock = available;
      product.unit = unit;
      product.hsnCode = hsnCode;
      product.received = Number(product.received) || 0;
    }
    state.unitsSold = state.products.reduce((sum,item) => sum + (Number(item.sales) || 0), 0);
    const change = newStock - sales;
    state.history.unshift({ date: new Date().toISOString(), name, code, unit, change, newStock, sales, after: available, reason: sales ? "sale" : newStock ? "purchase" : "correction", reasonLabel: sales ? "Sales updated" : "Stock updated", invoiceNumber });
    save(); render(); clearSalesForm(); toast("Product and sales updated.");
  });
  $("#historyExport").addEventListener("click", () => {
    if (!state.history.length) { toast("There is no stock history to export yet."); return; }
    const data = [["Date", "Product", "Product code", "Received", "Sales", "Available stock", "Unit", "Invoice Number"], ...state.history.map(x => [x.date,x.name,x.code,x.newStock || 0,x.sales || 0,x.after,x.unit,x.invoiceNumber || ""])];
    const csv = data.map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = "stockmate-history.csv"; link.click(); URL.revokeObjectURL(link.href);
  });
  render();
})();
