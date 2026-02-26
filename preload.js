const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {

    /* ============================= */
    /*           FTP                 */
    /* ============================= */

    connect: (data) =>
        ipcRenderer.invoke("ftp-connect", data),

    installApp: (appData) =>
        ipcRenderer.invoke("install-app", appData),

    checkAppInstalled: (name) =>
        ipcRenderer.invoke("check-app-installed", name),

    getHddInfo: () =>
        ipcRenderer.invoke("get-hdd-info"),

    /* ============================= */
    /*           CONFIG              */
    /* ============================= */

    saveConfig: (data) =>
        ipcRenderer.invoke("save-config", data),

    loadConfig: () =>
        ipcRenderer.invoke("load-config"),

    /* ============================= */
    /*        NETWORK SCAN           */
    /* ============================= */

    scanNetwork: () =>
        ipcRenderer.invoke("scan-network"),

    /* ============================= */
    /*       INSTALL PROGRESS        */
    /* ============================= */

    onProgress: (callback) => {
        ipcRenderer.removeAllListeners("install-progress");
        ipcRenderer.on("install-progress", (event, value) => {
            callback(value);
        });
    },

    removeProgressListener: () => {
        ipcRenderer.removeAllListeners("install-progress");
    },

    /* ============================= */
    /*            ABOUT              */
    /* ============================= */

    onAbout: (callback) => {
        ipcRenderer.removeAllListeners("open-about");
        ipcRenderer.on("open-about", callback);
    }

});