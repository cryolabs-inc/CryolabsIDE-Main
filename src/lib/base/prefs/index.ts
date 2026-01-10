import { LocalForageProvider } from "./storage/localforageProvider";
import type { StorageProvider } from "./types";

interface ObjectPrefs<T> {
    [k: string]: T;
}

// Each node is T_sub | undefined
export type FullObjectPrefs = ObjectPrefs<FullObjectPrefs> & {
    $asValue<T>(defaultVal?: T): Promise<T>;
    $store<T>(value: T): Promise<void>;
};

export class Prefs {
    _storageProvider: StorageProvider;
    static PathSymbol = Symbol("PathSymbol");

    // singleton default instance
    private static _defaultInstance: Prefs | null = null;

    static getDefaultStorageProvider() {
        return new LocalForageProvider();
    }

    static default(): Prefs {
        if (!this._defaultInstance) {
            this._defaultInstance = new Prefs();
        }
        return this._defaultInstance;
    }

    constructor(provider: StorageProvider = Prefs.getDefaultStorageProvider()) {
        this._storageProvider = provider;
    }

    async store<T>(key: string, value: T) {
        await this._storageProvider.store(key, value);
    }

    async get<T>(key: string, defaultVal: T): Promise<T | undefined> {
        return this._storageProvider.get<T>(key, defaultVal);
    }

    async getAsObjectPrefs(): Promise<FullObjectPrefs> {
        const rootPath = "$";

        const createProxy = (path: string): FullObjectPrefs => {
            return new Proxy(
                { [Prefs.PathSymbol]: path },
                {
                    get: (target, prop) => {
                        if (prop === Prefs.PathSymbol) return path;

                        // Sentinel methods with $ prefix
                        if (prop === "$asValue") {
                            return async (defaultVal?: any) => {
                                const key = path.startsWith("$.") ? path.slice(2) : path.slice(1);
                                return await this.get(key, defaultVal);
                            };
                        }

                        if (prop === "$store") {
                            return async (value: any) => {
                                const key = path.startsWith("$.") ? path.slice(2) : path.slice(1);
                                await this.store(key, value);
                            };
                        }

                        // recursively create nested proxy
                        return createProxy(`${path}.${String(prop)}`);
                    },

                    set: (target, prop, value) => {
                        // fire-and-forget async store for assignment
                        const key = `${path}.${String(prop)}`.slice(2);
                        this._storageProvider.store(key, value).catch(console.error);
                        return true;
                    },
                }
            ) as unknown as FullObjectPrefs;
        };

        return createProxy(rootPath);
    }
}
