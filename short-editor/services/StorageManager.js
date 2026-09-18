export class StorageManager {
    constructor() {
        this.dbName = 'ChronosShortsDB';
        this.dbVersion = 1;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('videos')) {
                    db.createObjectStore('videos');
                }
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };
            request.onerror = (e) => reject(e);
        });
    }

    saveMetadata(key, value) {
        localStorage.setItem(`chronos_short_${key}`, JSON.stringify(value));
    }

    getMetadata(key) {
        const item = localStorage.getItem(`chronos_short_${key}`);
        return item ? JSON.parse(item) : null;
    }

    async saveVideoBlob(id, blob) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('videos', 'readwrite');
            const store = tx.objectStore('videos');
            const req = store.put(blob, id);
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e);
        });
    }

    async getVideoBlob(id) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('videos', 'readonly');
            const store = tx.objectStore('videos');
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e);
        });
    }
}
