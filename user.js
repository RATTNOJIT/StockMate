(() => {
  const KEY="stockmate-inventory-v3";
  const $=selector=>document.querySelector(selector);
  const safe=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let state;
  let selectedUserReportProductCode="";
  const loadState=()=>{try{const saved=JSON.parse(localStorage.getItem(KEY));state=saved&&Array.isArray(saved.products)&&Array.isArray(saved.history)?saved:{products:[],history:[]};}catch{state={products:[],history:[]};}};
  const status=product=>Number(product.availableStock??product.stock)<=0?"Out of stock":Number(product.availableStock??product.stock)<=(Number(product.reorder)||5)?"Low stock":"In stock";
  const setView=id=>{
    document.querySelectorAll(".user-page").forEach(section=>section.classList.toggle("active",section.id===id));
    document.querySelectorAll(".user-nav a").forEach(link=>{const active=link.getAttribute("href")===`#${id}`;link.classList.toggle("active",active);active?link.setAttribute("aria-current","page"):link.removeAttribute("aria-current");});
    $("#userPageName").textContent=({"user-overview":"Overview","user-history":"Stock History","user-reports":"Reports","user-products":"Product List","user-details":"Product Details"})[id]||"Overview";
    $(".user-sidebar").classList.remove("open");
  };
  document.querySelectorAll('a[href^="#user-"]').forEach(link=>link.addEventListener("click",event=>{event.preventDefault();const id=link.getAttribute("href").slice(1);setView(id);history.replaceState(null,"",`#${id}`);}));
  $("#userMenu").addEventListener("click",()=>$(".user-sidebar").classList.toggle("open"));
  $("#userToday").textContent=new Intl.DateTimeFormat("en",{weekday:"short",month:"short",day:"numeric",year:"numeric"}).format(new Date());
  const renderProducts=()=>{
    const query=$("#productSearch").value.trim().toLowerCase();
    const products=[...state.products].filter(p=>`${p.name} ${p.code}`.toLowerCase().includes(query)).sort((a,b)=>a.name.localeCompare(b.name));
    $("#productRows").innerHTML=products.map(p=>{const available=Number(p.availableStock??p.stock)||0;const stateLabel=status(p);return `<tr><td data-label="Product Name"><strong>${safe(p.name)}</strong></td><td data-label="Product Code">${safe(p.code)}</td><td data-label="Available Stock"><strong>${available}</strong></td><td data-label="Unit">${safe(p.unit||"Piece")}</td><td data-label="Status"><span class="status-pill ${stateLabel.toLowerCase().replaceAll(" ","-")}">${stateLabel}</span></td></tr>`;}).join("");
    $("#productsEmpty").hidden=products.length>0;$("#productsEmpty").textContent=state.products.length?"No products match your search.":"No products available.";$("#productCount").textContent=`${products.length} product${products.length===1?"":"s"}`;
  };
  const renderDetails=()=>{
    const query=$("#detailsSearch").value.trim().toLowerCase();
    const all=[...state.products].sort((a,b)=>a.name.localeCompare(b.name));
    const products=all.filter(p=>`${p.name} ${p.code} ${p.hsnCode||""}`.toLowerCase().includes(query));
    $("#detailsRows").innerHTML=products.map(p=>`<tr><td data-label="Product Name"><strong>${safe(p.name)}</strong></td><td data-label="Product Code">${safe(p.code)}</td><td data-label="HSN Code">${safe(p.hsnCode||"—")}</td></tr>`).join("");
    $("#detailsEmpty").hidden=products.length>0;$("#detailsEmpty").textContent=all.length?"No products match your search.":"No product details available.";$("#detailsCount").textContent=`${products.length} product${products.length===1?"":"s"}`;
  };
  const localDateValue=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  let currentHistoryDay=localDateValue(new Date());
  const renderHistory=()=>{
    if(!$("#historyDate").value)$("#historyDate").value=currentHistoryDay;
    const selected=$("#historyDate").value;
    const items=[...state.history].filter(item=>{if(!selected)return true;const d=new Date(item.date);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`===selected;}).sort((a,b)=>new Date(b.date)-new Date(a.date));
    $("#historyRows").innerHTML=items.map(item=>{const date=new Date(item.date);const type=Number(item.sales)>0?"Sales updated":Number(item.newStock)>0?"Stock received":"Stock corrected";const change=`+${Number(item.newStock)||0} / −${Number(item.sales)||0} ${safe(item.unit||"Piece")}`;return `<tr><td>${date.toLocaleString("en",{dateStyle:"medium",timeStyle:"short"})}</td><td><strong>${safe(item.name)}</strong><small>${safe(item.code)}</small></td><td>${type}</td><td>${change}</td><td>${Number(item.after)||0} ${safe(item.unit||"Piece")}</td><td>${safe(item.invoiceNumber||"—")}</td></tr>`;}).join("");
    $("#historyEmpty").hidden=items.length>0;$("#historyCount").textContent=selected?`${items.length} update${items.length===1?"":"s"} on ${selected}`:`${items.length} stock update${items.length===1?"":"s"}`;
  };
  const renderReports=()=>{
    const range=$("#reportPeriod").value;const today=new Date();today.setHours(0,0,0,0);const start=new Date(today);
    if(range==="7days")start.setDate(start.getDate()-6);else if(range==="30days")start.setDate(start.getDate()-29);else start.setDate(1);
    const snapshots=new Map(),movements=[];
    [...state.history].sort((a,b)=>new Date(a.date)-new Date(b.date)).forEach(item=>{const d=new Date(item.date),day=new Date(d);day.setHours(0,0,0,0);const key=`${item.code}|${d.getFullYear()}-${d.getMonth()}`;const previous=snapshots.get(key)||{received:0,sold:0};const current={received:Number(item.newStock)||0,sold:Number(item.sales)||0};if(day>=start&&day<=today)movements.push({day,received:current.received-previous.received,sold:current.sold-previous.sold});snapshots.set(key,current);});
    const received=Math.max(0,movements.reduce((sum,m)=>sum+m.received,0)),sold=Math.max(0,movements.reduce((sum,m)=>sum+m.sold,0));
    const metrics=[["Stock Received",received,"Units added during this period","＋"],["Units Sold",sold,"Units sold during this period","↗"],["Net Movement",received-sold,"Received minus sold","↕"],["Products Tracked",state.products.length,"Products in your list","▦"]];
    $("#reportMetrics").innerHTML=metrics.map(([label,value,foot,icon])=>`<article class="user-metric"><div><span>${label}</span><i>${icon}</i></div><strong>${value.toLocaleString("en")}<small>${label==="Products Tracked"?"products":"units"}</small></strong><p>${foot}</p></article>`).join("");
    const dayCount=range==="7days"?7:range==="30days"?30:today.getDate();const days=Array.from({length:dayCount},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d;});const map=new Map(days.map(d=>[d.toDateString(),{received:0,sold:0}]));movements.forEach(m=>{const e=map.get(m.day.toDateString());if(e){e.received+=Math.max(0,m.received);e.sold+=Math.max(0,m.sold);}});const max=Math.max(1,...[...map.values()].flatMap(x=>[x.received,x.sold]));
    $("#movementChart").innerHTML=days.map((d,i)=>{const x=map.get(d.toDateString()),show=range==="7days"||i===0||i===days.length-1||i%5===0;return `<div class="chart-day"><div><i class="received-bar" style="--h:${x.received?Math.max(4,x.received/max*100):0}%"></i><i class="sold-bar" style="--h:${x.sold?Math.max(4,x.sold/max*100):0}%"></i></div><small>${show?d.toLocaleDateString("en",{month:"short",day:"numeric"}):""}</small></div>`;}).join("");$("#movementEmpty").hidden=received+sold>0;
    const inStock=state.products.filter(p=>Number(p.availableStock??p.stock)>(Number(p.reorder)||5)).length,low=state.products.filter(p=>Number(p.availableStock??p.stock)>0&&Number(p.availableStock??p.stock)<=(Number(p.reorder)||5)).length,out=state.products.length-inStock-low,total=state.products.length||1;
    $("#statusTotal").textContent=state.products.length;$("#statusInCount").textContent=inStock;$("#statusLowCount").textContent=low;$("#statusOutCount").textContent=out;$("#statusIn").style.width=`${inStock/total*100}%`;$("#statusLow").style.width=`${low/total*100}%`;$("#statusOut").style.width=`${out/total*100}%`;
    renderSelectedProduct();
    const month=$("#salesMonth");if(!month.value)month.value=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`;const [year,monthNumber]=month.value.split("-").map(Number);const monthHistory=state.history.filter(item=>{const d=new Date(item.date);return d.getFullYear()===year&&d.getMonth()+1===monthNumber;});$("#salesMonthLabel").textContent=new Date(year,monthNumber-1,1).toLocaleDateString("en",{month:"long",year:"numeric"});const salesByCode=new Map();[...monthHistory].sort((a,b)=>new Date(a.date)-new Date(b.date)).forEach(item=>salesByCode.set(item.code,{sales:Number(item.sales)||0}));const ranked=state.products.map(p=>({product:p,sales:salesByCode.get(p.code)?.sales||0})).sort((a,b)=>b.sales-a.sales||a.product.name.localeCompare(b.product.name));const hasRecords=monthHistory.length>0;$("#topProducts").hidden=!hasRecords||!ranked.length;$("#topProductsEmpty").hidden=hasRecords&&ranked.length>0;$("#topProductsEmpty").textContent=hasRecords?"No products to compare yet.":"No record found for this month.";if(ranked.length){const cards=[["MOST SOLD",ranked[0]],["LEAST SOLD",ranked[ranked.length-1]]];$("#topProducts").innerHTML=cards.map(([label,item],i)=>`<div class="rank-card ${i?"least":"most"}"><span>${label}</span><strong>${safe(item.product.name)}</strong><small>${safe(item.product.code)}</small><b>${item.sales} ${safe(item.product.unit||"Piece")}</b></div>`).join("");}
  };
  function renderSelectedProduct(){
    const month=$("#userProductMonth"), today=new Date();
    if(!month.value)month.value=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`;
    const [year,monthNumber]=month.value.split("-").map(Number),product=state.products.find(p=>p.code===selectedUserReportProductCode);
    const entries=product?[...state.history].filter(item=>{const d=new Date(item.date);return item.code===product.code&&d.getFullYear()===year&&d.getMonth()+1===monthNumber;}).sort((a,b)=>new Date(a.date)-new Date(b.date)):[];
    const latest=entries.at(-1)||null;
    $("#userSelectedMetrics").hidden=Boolean(product&&!latest);$("#userSelectedNoResult").hidden=!(product&&!latest);
    $("#userSelectedSold").textContent=product&&latest?`${Number(latest.sales)||0} ${product.unit||"Piece"}`:"—";
    $("#userSelectedReceived").textContent=product&&latest?`${Number(latest.newStock)||0} ${product.unit||"Piece"}`:"—";
    $("#userSelectedAvailable").textContent=product?`${Number(product.availableStock??product.stock)||0} ${product.unit||"Piece"}`:"—";
  }
  function renderUserProductOptions(){
    const input=$("#userProductSearch"),options=$("#userProductOptions"),query=input.value.trim().toLowerCase();
    const matches=[...state.products].filter(p=>`${p.name} ${p.code}`.toLowerCase().includes(query)).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,50);
    options.innerHTML=matches.map(p=>`<button type="button" role="option" class="user-product-option" data-user-product="${safe(p.code)}"><strong>${safe(p.name)}</strong><small>${safe(p.code)}</small></button>`).join("");options.hidden=!matches.length;
  }
  function refreshHistoryDay(){const today=localDateValue(new Date());if(today===currentHistoryDay)return;const input=$("#historyDate");if(!input.value||input.value===currentHistoryDay)input.value=today;currentHistoryDay=today;$("#userToday").textContent=new Intl.DateTimeFormat("en",{weekday:"short",month:"short",day:"numeric",year:"numeric"}).format(new Date());renderHistory();}
  window.setInterval(refreshHistoryDay,30000);window.addEventListener("focus",refreshHistoryDay);window.addEventListener("pageshow",refreshHistoryDay);
  const render=()=>{loadState();renderProducts();renderDetails();renderHistory();renderReports();};
  $("#productSearch").addEventListener("input",renderProducts);$("#detailsSearch").addEventListener("input",renderDetails);$("#historyDate").addEventListener("input",renderHistory);$("#clearHistoryDate").addEventListener("click",()=>{$("#historyDate").value=localDateValue(new Date());renderHistory();});$("#reportPeriod").addEventListener("change",renderReports);$("#salesMonth").addEventListener("change",renderReports);
  $("#userProductMonth").addEventListener("change",renderSelectedProduct);
  $("#userProductSearch").addEventListener("input",()=>{selectedUserReportProductCode="";renderSelectedProduct();renderUserProductOptions();});
  $("#userProductSearch").addEventListener("focus",renderUserProductOptions);
  $("#userProductSearch").addEventListener("keydown",event=>{if(event.key==="Escape")$("#userProductOptions").hidden=true;const first=$("#userProductOptions .user-product-option");if(event.key==="Enter"&&first){event.preventDefault();first.click();}});
  $("#userProductOptions").addEventListener("click",event=>{const option=event.target.closest("[data-user-product]");if(!option)return;selectedUserReportProductCode=option.dataset.userProduct;const product=state.products.find(p=>p.code===selectedUserReportProductCode);$("#userProductSearch").value=product?`${product.name} · ${product.code}`:"";$("#userProductOptions").hidden=true;renderSelectedProduct();});
  document.addEventListener("click",event=>{if(!event.target.closest(".user-product-picker"))$("#userProductOptions").hidden=true;});
  window.addEventListener("storage",event=>{if(event.key===KEY)render();});window.addEventListener("focus",render);window.addEventListener("pageshow",render);
  if(location.hash&&document.querySelector(location.hash+".user-page"))setView(location.hash.slice(1));render();
})();
