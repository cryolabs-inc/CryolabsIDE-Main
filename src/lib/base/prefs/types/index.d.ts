export interface StorageProvider {
    store<T>(key: string, value: T): Promise<void>;
    get<T>(key: string, defaultVal: T): Promise<T>;
}