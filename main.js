const { app, BrowserWindow, ipcMain, Menu, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const https = require("https");
const { exec } = require("child_process");

const ftp = require("basic-ftp");
const StreamZip = require("node-stream-zip");
const { autoUpdater } = require("electron-updater");

let mainWindow;

let client = new ftp.Client();
let connectionConfig = null;

/* ============================= */
/*        AUTO UPDATER CONFIG    */
/* ============================= */

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

const configPath = path.join(app.getPath("userData"), "config.json");

/* ============================= */
/*        CREATE WINDOW          */
/* ============================= */

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 720,
        show: false,
        autoHideMenuBar: false,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true
        }
    });

    mainWindow.loadFile("app/index.html");

    mainWindow.once("ready-to-show", () => {
        mainWindow.maximize();
        mainWindow.show();
    });

    createMenu();
}

/* ============================= */
/*        AUTO UPDATE            */
/* ============================= */

function initAutoUpdate() {

    autoUpdater.autoDownload = false;

    autoUpdater.checkForUpdates();

    autoUpdater.on("update-available", () => {
        dialog.showMessageBox(mainWindow, {
            type: "info",
            title: "Atualização disponível",
            message: "Nova versão disponível. Deseja atualizar agora?",
            buttons: ["Atualizar", "Depois"]
        }).then(result => {
            if (result.response === 0) {
                autoUpdater.downloadUpdate();
            }
        });
    });

    autoUpdater.on("download-progress", (progress) => {
        console.log(`Baixando: ${Math.round(progress.percent)}%`);
    });

    autoUpdater.on("update-downloaded", () => {
        dialog.showMessageBox(mainWindow, {
            type: "info",
            title: "Atualização pronta",
            message: "Atualização baixada. Reiniciar agora?",
            buttons: ["Reiniciar", "Depois"]
        }).then(result => {
            if (result.response === 0) {
                autoUpdater.quitAndInstall();
            }
        });
    });
}

/* ============================= */
/*            MENU               */
/* ============================= */

function createMenu() {
    const template = [
        {
            label: "Arquivo",
            submenu: [
                { role: "reload", label: "Recarregar" },
                { type: "separator" },
                { role: "quit", label: "Sair" }
            ]
        },
        {
            label: "Editar",
            submenu: [
                { role: "undo", label: "Desfazer" },
                { role: "redo", label: "Refazer" },
                { type: "separator" },
                { role: "copy", label: "Copiar" },
                { role: "paste", label: "Colar" }
            ]
        },
        {
            label: "Sobre",
            submenu: [
                {
                    label: "Sobre o App",
                    click: () => {
                        mainWindow.webContents.send("open-about");
                    }
                },
                { type: "separator" },
                {
                    label: "YouTube",
                    click: () => {
                        shell.openExternal("https://youtube.com/@lanpobre");
                    }
                },
                {
                    label: "Discord",
                    click: () => {
                        shell.openExternal("https://discord.gg/5zynNvcHq2");
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

/* ============================= */
/*         APP READY             */
/* ============================= */

app.whenReady().then(() => {
    createWindow();
    initAutoUpdate();
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

/* ============================= */
/*        FTP CONNECT            */
/* ============================= */

ipcMain.handle("ftp-connect", async (event, data) => {
    try {

        connectionConfig = data;

        await client.access({
            host: data.host,
            user: data.user,
            password: data.password,
            port: 21
        });

        return { success: true };

    } catch (err) {
        return { success: false, error: err.message };
    }
});

/* ============================= */
/*        SCAN NETWORK           */
/* ============================= */

ipcMain.handle("scan-network", async () => {

    const interfaces = require("os").networkInterfaces();
    let baseIP = "192.168.1.";

    // Detectar automaticamente a rede local
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === "IPv4" && !iface.internal) {
                const parts = iface.address.split(".");
                baseIP = parts[0] + "." + parts[1] + "." + parts[2] + ".";
            }
        }
    }

    const found = [];
    let foundIP = null;

    const concurrency = 30; // quantidade paralela
    let current = 1;

    async function worker() {

        while (current <= 254 && !foundIP) {

            const ip = baseIP + current++;
            const testClient = new ftp.Client();
            testClient.ftp.verbose = false;

            try {

                await testClient.access({
                    host: ip,
                    user: "xboxftp",
                    password: "xboxftp",
                    timeout: 300
                });

                foundIP = ip;
                found.push(ip);
                testClient.close();
                break;

            } catch {
                testClient.close();
            }
        }
    }

    const workers = [];

    for (let i = 0; i < concurrency; i++) {
        workers.push(worker());
    }

    await Promise.all(workers);

    return found;
});


/* ============================= */
/*        SAVE / LOAD CONFIG     */
/* ============================= */

ipcMain.handle("save-config", async (event, data) => {
    fs.writeFileSync(configPath, JSON.stringify(data));
    return true;
});

ipcMain.handle("load-config", async () => {
    if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath));
    }
    return null;
});

/* ============================= */
/*        HDD INFO               */
/* ============================= */

ipcMain.handle("get-hdd-info", async () => {
    try {

        const response = await client.send("STAT");

        return {
            success: true,
            raw: response.message
        };

    } catch (e) {
        return { success: false, error: e.message };
    }
});

/* ============================= */
/*        INSTALL APP            */
/* ============================= */

ipcMain.handle("install-app", async (event, appData) => {

    if (!connectionConfig) {
        return { success: false, error: "Not connected" };
    }

    const extension = path.extname(appData.download).toLowerCase();
    const tempFilePath = path.join(os.tmpdir(), appData.name + extension);
    const extractPath = path.join(os.tmpdir(), appData.name);

    // 🔥 Define pasta remota baseada no type
    const isPlugin = appData.type && appData.type.toLowerCase() === "plugin";
    const remoteBasePath = isPlugin
        ? "/Hdd1/Plugins/" + appData.name
        : "/Hdd1/Apps/" + appData.name;

    try {

        /* 1️⃣ DOWNLOAD */

        const downloadFile = (url, dest) => {
            return new Promise((resolve, reject) => {

                const request = https.get(url, (response) => {

                    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                        return resolve(downloadFile(response.headers.location, dest));
                    }

                    if (response.statusCode !== 200) {
                        return reject(new Error("Download failed with status " + response.statusCode));
                    }

                    const file = fs.createWriteStream(dest);

                    response.pipe(file);

                    file.on("finish", () => {
                        file.close(resolve);
                    });

                });

                request.on("error", err => {
                    fs.unlink(dest, () => {});
                    reject(err);
                });

            });
        };

        await downloadFile(appData.download, tempFilePath);

        /* 2️⃣ EXTRACT */

        if (extension === ".zip") {

            const zip = new StreamZip.async({ file: tempFilePath });
            await zip.extract(null, extractPath);
            await zip.close();

        } else if (extension === ".rar") {

            await new Promise((resolve, reject) => {

                const winrarPath = `"C:\\Program Files\\WinRAR\\WinRAR.exe"`;
                const command = `${winrarPath} x -o+ "${tempFilePath}" "${extractPath}\\"`;

                exec(command, (error) => {
                    if (error) {
                        reject(new Error("Erro ao extrair RAR. WinRAR não encontrado."));
                    } else {
                        resolve();
                    }
                });

            });

        } else {
            throw new Error("Formato não suportado (use .zip ou .rar)");
        }

        /* 3️⃣ FTP */

        const uploadClient = new ftp.Client();

        await uploadClient.access({
            host: connectionConfig.host,
            user: connectionConfig.user,
            password: connectionConfig.password,
            port: 21
        });

        async function uploadFolder(localFolder, remoteFolder) {

            await uploadClient.ensureDir(remoteFolder);

            const items = fs.readdirSync(localFolder);

            for (const item of items) {

                const localPath = path.join(localFolder, item);
                const remotePath = remoteFolder + "/" + item;

                if (fs.lstatSync(localPath).isDirectory()) {
                    await uploadFolder(localPath, remotePath);
                } else {
                    await uploadClient.uploadFrom(localPath, remotePath);
                }
            }
        }

        await uploadFolder(extractPath, remoteBasePath);

        uploadClient.close();

        /* 4️⃣ CLEANUP */

        fs.rmSync(extractPath, { recursive: true, force: true });
        fs.unlinkSync(tempFilePath);

        return { success: true };

    } catch (err) {
        return { success: false, error: err.message };
    }
});
/* ============================= */
/*   CHECK APP / PLUGIN         */
/* ============================= */

ipcMain.handle("check-app-installed", async (event, appName) => {

    if (!connectionConfig) {
        return { success: false };
    }

    const tempClient = new ftp.Client();

    try {

        await tempClient.access({
            host: connectionConfig.host,
            user: connectionConfig.user,
            password: connectionConfig.password,
            port: 21
        });

        // 🔍 CHECK APPS
        let installedIn = null;

        try {
            await tempClient.cd("Hdd1:");
            await tempClient.cd("Apps");

            const appsList = await tempClient.list();

            if (appsList.some(item => item.name === appName)) {
                installedIn = "apps";
            }
        } catch {}

        // 🔍 CHECK PLUGINS
        if (!installedIn) {
            try {
                await tempClient.cd("/Hdd1/Plugins");

                const pluginsList = await tempClient.list();

                if (pluginsList.some(item => item.name === appName)) {
                    installedIn = "plugins";
                }
            } catch {}
        }

        tempClient.close();

        return {
            success: true,
            installed: !!installedIn,
            location: installedIn // "apps" | "plugins" | null
        };

    } catch (err) {
        tempClient.close();
        return { success: false };
    }
});

