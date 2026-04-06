import localforage from "localforage";
import type { StorageProvider } from "../types";

export class LocalForageProvider implements StorageProvider {
    async store<T>(key: string, value: T) {
        await localforage.setItem<T>(key, value);
    }
    async get<T>(key: string, defaultVal: T): Promise<T> {
        const it = await localforage.getItem<T>(key);
        if (it === null) {
            return defaultVal;
        }
        return it;
    }
}