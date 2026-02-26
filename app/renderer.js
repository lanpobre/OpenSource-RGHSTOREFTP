let items = [];
let lastJsonHash = null;
const STORE_URL = "https://raw.githubusercontent.com/lanpobre/rghstore/main/store.json";

// =============================
//    UTIL: HASH PARA JSON
// =============================
function generateHash(data) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
}

// =============================
//          CONNECT
// =============================
async function connect(auto = false) {
    const host = document.getElementById("host").value.trim();
    const user = document.getElementById("user").value || "xboxftp";
    const pass = document.getElementById("pass").value || "xboxftp";
    const statusEl = document.getElementById("connectionStatus");

    if (!host || host.endsWith(".")) {
        if (!auto) alert("Digite o IP completo do Xbox (ex: 192.168.1.100)");
        return;
    }

    try {
        statusEl.innerText = "🟡 CONECTANDO...";

        const res = await window.api.connect({ host, user, password: pass });

        if (!res.success) {
            statusEl.innerText = "🔴 OFFLINE";
            if (!auto) alert(res.error);
            return;
        }

        await window.api.saveConfig({ host, user, pass });
        statusEl.innerText = "🟢 ONLINE";

        await loadStore();

        const info = await window.api.getHddInfo();
        if (info.success) document.getElementById("hddInfo").innerText = info.raw;

    } catch (err) {
        statusEl.innerText = "🔴 OFFLINE";
        if (!auto) alert("Erro inesperado: " + err.message);
    }
}

// =============================
//        LOAD STORE JSON
// =============================
async function loadStore() {
    try {
        const response = await fetch(STORE_URL + "?t=" + Date.now());
        const newItems = await response.json();
        const newHash = generateHash(newItems);

        if (newHash === lastJsonHash) return; // nada mudou
        lastJsonHash = newHash;
        items = newItems;

        renderStore(items);
        console.log("Loja atualizada.");

    } catch (err) {
        console.log("Erro ao atualizar store:", err.message);
    }
}

// =============================
//          RENDER STORE
// =============================
function renderStore(list) {
    const store = document.getElementById("store");
    store.innerHTML = "";

    list.forEach(app => createCard(app));
}

// =============================
//          CREATE CARD
// =============================
async function createCard(app) {
    const store = document.getElementById("store");

    const check = await window.api.checkAppInstalled(app.name, app.type || "app");
    const installed = check.success && check.installed;

    const card = document.createElement("div");
    card.className = "card";

    const buttonText = installed ? "✔ INSTALADO" : "⬇ INSTALAR";
    const buttonClass = installed ? "installed" : "";

    card.innerHTML = `
        <img src="${app.cover}">
        <h3>${app.title}</h3>
        <button class="${buttonClass}" data-app='${JSON.stringify(app)}'>
            ${buttonText}
        </button>
    `;

    const button = card.querySelector("button");
    if (!installed) button.addEventListener("click", () => install(app, button));

    store.appendChild(card);
}

// =============================
//           INSTALL
// =============================
async function install(app, button) {
    button.disabled = true;
    button.innerText = "Instalando...";

    const res = await window.api.installApp(app);

    if (res.success) {
        button.innerText = "✔ INSTALADO";
        button.classList.add("installed");
    } else {
        button.innerText = "⬇ INSTALAR";
        button.disabled = false;
        alert(res.error);
    }
}

// =============================
//        PROGRESS BAR
// =============================
window.api.onProgress(percent => {
    document.getElementById("progressBar").style.width = percent + "%";
});

// =============================
//       SEARCH FILTER
// =============================
const searchBox = document.getElementById("searchBox");
searchBox.addEventListener("input", () => {
    const query = searchBox.value.toLowerCase();
    const filtered = items.filter(app =>
        app.name.toLowerCase().includes(query) ||
        app.title.toLowerCase().includes(query)
    );
    renderStore(filtered);
});

// =============================
//       AUTO LOAD CONFIG
// =============================
window.addEventListener("DOMContentLoaded", async () => {
    const config = await window.api.loadConfig();
    if (config) {
        document.getElementById("host").value = config.host;
        document.getElementById("user").value = config.user;
        document.getElementById("pass").value = config.pass;
        connect(true);
    }
});

// =============================
//         SCAN XBOX
// =============================
async function scanXbox() {
    const status = document.getElementById("connectionStatus");
    status.innerText = "🔍 Escaneando rede...";
    const ips = await window.api.scanNetwork();

    if (ips.length > 0) {
        document.getElementById("host").value = ips[0];
        status.innerText = "🟢 Xbox encontrado: " + ips[0];
    } else {
        status.innerText = "🔴 Nenhum Xbox encontrado";
    }
}

// =============================
//      REFRESH AUTOMATICO
// =============================
setInterval(() => loadStore(), 2000);