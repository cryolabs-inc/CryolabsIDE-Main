import { createContext, type Component, type ComponentProps } from "svelte";
import RawTextViewer from "./viewers/RawTextViewer.svelte";
import MonacoEditor from "./viewers/MonacoEditor.svelte";
import { fileTypeFromBuffer } from 'file-type';
import Mime from 'mime';
import path from "path-browserify";
import { Errno, type Exception } from "kerium";
import type { FSProviderAPI } from '$lib/emulator/types';
import FileTreeViewer from "./viewers/file/FileTreeViewer.svelte";
// --- Resource Types ---


type ResourcePanel<T = Component<any, any>> = T extends Component<infer Props> ?
    {
        component: T,
        props: Props
    } : never;
interface ResourceStorageReference<T = unknown> {
    resolve(): Promise<T>;
}

interface ResourceData {
    data?: Blob;
    path?: string;
}

interface Rmap<T extends unknown[]> {
    "panel": ResourcePanel<T[0]>
    "reference": ResourceStorageReference<T[0]>
    "data": ResourceData
};

type Resource<T extends unknown[]> = {
    [K in keyof Rmap<T>]: {
        type: K,
        data: Rmap<T>[K]
    }
}[keyof Rmap<T>];
type ResourceMember<
    T extends unknown[],
    K extends keyof Rmap<T>
> = {
    type: K;
    data: Rmap<T>[K];
};
type a<T extends unknown[]> = Extract<Resource<T>, ResourceMember<T, "data">>;
// --- Response class ---
type TheExtracted<T, K extends keyof Rmap<unknown[]>> = T extends Rmap<infer params> ? Rmap<params>[K] : never;

type ToResource = <T extends unknown[], K extends keyof Rmap<T>>(type: K, val: Rmap<T>[K]) => ResourceMember<T, K>

const toResource: ToResource = (type, dat) => {
    return {
        "type": type,
        "data": dat as any
    };
};




export class ResourceResponse<T extends any[] = any[], R = Resource<T>> {
    status: number;
    statusMessage: string;
    resource?: R;
    headers?: HeadersInit;

    constructor(
        status: number,
        statusMessage: string,
        { resource, headers }: { resource?: R; headers?: HeadersInit } = {}
    ) {
        this.status = status;
        this.statusMessage = statusMessage;
        this.resource = resource;
        this.headers = headers;
    }
    get type() {
        let r = this as ResourceResponse;
        if (!r.resource) {
            return "none";
        }
        return r.resource?.type;
    }
    get panel() {
        let r = this as ResourceResponse;
        if (!r.resource || r.resource.type !== "panel") {
            throw new Error("Trying to get a panel from a non-panel response.");
        }
        else {
            return r.resource.data;
        }
    }
    get blob() {
        let r = this as ResourceResponse;
        if (!r.resource || r.resource.type !== "data") {
            throw new Error("Trying to read the blob data from a non-data response.");
        }
        else {
            if (!r.resource.data.data) {
                throw new Error("Trying to read a refernece as a blob.")
            }
            return r.resource.data.data;
        }
    }
    get stream() {
        let b = this.blob;
        return new Response(b).body;
    }
    static async fromFetchResponse(fetchResponse: Response): Promise<ResourceResponse> {
        return new ResourceResponse<[]>(fetchResponse.status, fetchResponse.statusText, {
            headers: fetchResponse.headers,
            resource: {
                type: "data",
                data: {
                    data: await fetchResponse.blob()
                }
            },
        });
    }

    static methodNotAllowed<R extends unknown[]>(): ResourceResponse {
        return new ResourceResponse(405, "Method Not Allowed");
    }

    static notFound(): ResourceResponse {
        return new ResourceResponse(404, "Not Found");
    }

    static ok<R extends unknown[] = [], K extends keyof Rmap<R> = "panel">(type: K | "none", resource?: TheExtracted<Rmap<R>, K>): ResourceResponse<R> {
        if (type === "none") {
            return new ResourceResponse<R>(200, "OK");
        }
        if (!resource) {
            throw new Error("Specified resource type, but no actual resource backing it.");
        }
        return new ResourceResponse<R>(200, "OK", { resource: toResource<R, K>(type, resource) as Resource<R> });
    }

}

// --- Method types ---

type HTTPMethods = "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "CONNECT" | "OPTIONS" | "TRACE" | "PATCH";
type ResourceSpecificMethods = "RETRPANEL";
export type ResourceMethod = HTTPMethods | ResourceSpecificMethods;

// --- Handler interface ---

export interface ResourceHandlerEntry {
    fetch(request: Request): Promise<ResourceResponse>;
}

// --- Simple handler base class ---
type RR<T> = T extends ResourceResponse<infer X, infer Y> ?
    ResourceResponse<X, Y> : never;
export class SimpleResourceHandler implements ResourceHandlerEntry {
    async doGet(request: Request): Promise<ResourceResponse> {
        return ResourceResponse.methodNotAllowed();
    }

    async doHead(request: Request): Promise<ResourceResponse> {
        return ResourceResponse.methodNotAllowed();
    }

    async doPost(request: Request): Promise<ResourceResponse> {
        return ResourceResponse.methodNotAllowed();
    }

    async doPut(request: Request): Promise<ResourceResponse> {
        return ResourceResponse.methodNotAllowed();
    }

    async doDelete(request: Request): Promise<ResourceResponse> {
        return ResourceResponse.methodNotAllowed();
    }

    async doConnect(request: Request): Promise<ResourceResponse> {
        return ResourceResponse.methodNotAllowed();
    }

    async doOptions(request: Request): Promise<ResourceResponse> {
        return ResourceResponse.methodNotAllowed();
    }

    async doTrace(request: Request): Promise<ResourceResponse> {
        return ResourceResponse.methodNotAllowed();
    }

    async doPatch(request: Request): Promise<ResourceResponse> {
        return ResourceResponse.methodNotAllowed();
    }

    async doRetrpanel(request: Request): Promise<ResourceResponse> {
        return ResourceResponse.methodNotAllowed();
    }

    async fetch(request: Request): Promise<ResourceResponse> {
        const method = request.method.toUpperCase() as ResourceMethod;

        switch (method) {
            case "GET": return this.doGet(request);
            case "HEAD": return this.doHead(request);
            case "POST": return this.doPost(request);
            case "PUT": return this.doPut(request);
            case "DELETE": return this.doDelete(request);
            case "CONNECT": return this.doConnect(request);
            case "OPTIONS": return this.doOptions(request);
            case "TRACE": return this.doTrace(request);
            case "PATCH": return this.doPatch(request);
            case "RETRPANEL": return this.doRetrpanel(request);
            default: return ResourceResponse.methodNotAllowed();
        }
    }
}

// --- HTTP/HTTPS handler ---

class HttpHandler extends SimpleResourceHandler {
    async fetch(request: Request): Promise<ResourceResponse> {
        const method = request.method.toUpperCase();
        if (method === "RETRPANEL") {
            return this.doRetrpanel(request);
        }
        return ResourceResponse.fromFetchResponse(await fetch(request));
    }

    async doRetrpanel(request: Request) {
        const getRequest = new Request(request, { method: "GET", headers: request.headers });
        const response = await this.fetch(getRequest);

        if (response.resource && response.resource.type === "data") {
            let dat = response.resource.data.data;
            if (dat?.type === "text/html") {
                return new ResourceResponse<[typeof RawTextViewer]>(response.status, response.statusMessage, {
                    resource: {
                        type: "panel",
                        data: {
                            component: RawTextViewer,
                            props: { dat: new Uint8Array([25]) }
                        }
                    }
                })
            }
            if (dat) {
                return new ResourceResponse<[typeof RawTextViewer]>(response.status, response.statusMessage, {
                    resource: {
                        type: "panel",
                        data: {
                            component: RawTextViewer,
                            props: {
                                dat: new Uint8Array(await dat.arrayBuffer())
                            }
                        }
                    }
                });
            }
        }
        return ResourceResponse.notFound();
    }
}

export class FileHandler extends SimpleResourceHandler {
    fsAPI: FSProviderAPI;
    constructor(fileSystemAPI: FSProviderAPI) {
        super();
        this.fsAPI = fileSystemAPI;
    }

    async doRetrpanel(request: Request): Promise<ResourceResponse> {
        const getRequest = await this.doGet(request);
        let fsP = this.fsAPI;
        if ((getRequest.status >= 200 && getRequest.status < 300) && getRequest.resource && getRequest.resource.type === "data" && getRequest.resource.data.data)
            return new ResourceResponse<[typeof MonacoEditor]>(getRequest.status, getRequest.statusMessage, {
                resource: {
                    "type": "panel",
                    data: {
                        component: MonacoEditor,
                        props: {
                            value: getRequest.resource.data.data,
                            onChangeContent: async (newC) => {
                                await fsP.writeFile(this.getPathnameFromRequest(request), newC.buffer as ArrayBuffer, newC.length, 0);
                            }
                        }
                    }
                }
            });

        return ResourceResponse.notFound();
    }
    getPathnameFromRequest(request: Request) {
        return new URL(request.url).pathname;
    }
    async doGet(request: Request): Promise<ResourceResponse> {
        let fsPath = this.getPathnameFromRequest(request);
        let fsP = this.fsAPI;
        let newC = await fsP.stat(fsPath);

        try {
            let readBuffer = (await fsP.readFile(fsPath, newC.size, 0)) as Uint8Array<ArrayBuffer>;
            let mt = (await fileTypeFromBuffer(readBuffer))?.mime || Mime.getType(path.extname(fsPath))   || "";
            return ResourceResponse.ok("data", {
                data: new Blob([readBuffer], { type: mt  })
            });
        } catch (e) {
            let ex = e as Exception;
            if (ex.errno === Errno.ENOENT || ex.errno === Errno.EISDIR) {
                return ResourceResponse.notFound();
            }
            else {
                throw ex;
            }
        }
    }
    async doPut(request: Request): Promise<ResourceResponse> {
        let fsPath = this.getPathnameFromRequest(request);
        let fsP = this.fsAPI;
        let buffer = new Uint8Array(await request.arrayBuffer());
        await fsP.writeFile(fsPath, buffer.buffer, buffer.byteLength, 0);
        return ResourceResponse.ok("none");
    }
}
export class FileTreePanelHandler extends FileHandler {
    async doRetrpanel(request: Request): Promise<ResourceResponse> {
        let pname = this.getPathnameFromRequest(request);
        return ResourceResponse.ok<[typeof FileTreeViewer]>("panel", {
            component: FileTreeViewer,
            props: {
                rootDir: pname
            }
        });
    }
}
class RawResourceHandler extends SimpleResourceHandler {
    async doRetrpanel(request: Request): Promise<ResourceResponse> {
        let p = await this.doGet(request);
        return ResourceResponse.ok<[typeof RawTextViewer]>("panel", {
            component: RawTextViewer,
            props: {
                dat: new Uint8Array(await p.blob.arrayBuffer())
            }
        });
    }
}
class Sample extends RawResourceHandler {
    async doGet(request: Request): Promise<ResourceResponse> {
        if (new URL(request.url).pathname === "/wait") {
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
        return ResourceResponse.ok("data", {
            data: new Blob(["URL: " + request.url])
        })
    }
}

// --- Resource Manager ---

export class ResourceManager {
    private schemeMap: Map<string, ResourceHandlerEntry> = new Map();

    registerScheme(scheme: string, handler: ResourceHandlerEntry): this {
        this.schemeMap.set(scheme, handler);
        return this;
    }

    unregisterScheme(scheme: string): boolean {
        return this.schemeMap.delete(scheme);
    }

    getHandler(scheme: string): ResourceHandlerEntry | undefined {
        return this.schemeMap.get(scheme);
    }

    async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<ResourceResponse> {
        const request = new Request(input, init);
        const url = new URL(request.url);
        const scheme = url.protocol.slice(0, -1); // remove trailing ':'

        const handler = this.schemeMap.get(scheme);
        if (!handler) {
            throw new Error(`No handler registered for scheme: ${scheme}`);
        }

        return handler.fetch(request);
    }
    static async addDefaultSchemes(resourceManager: ResourceManager) {
        resourceManager
            .registerScheme("http", new HttpHandler())
            .registerScheme("https", new HttpHandler())
            .registerScheme("sample", new Sample());
    }
}


// --- Default instance ---

export const defaultResourceManager = new ResourceManager()
ResourceManager.addDefaultSchemes(defaultResourceManager)
// Convenience export
export const defaultResourceFetch = defaultResourceManager.fetch.bind(defaultResourceManager);
export const [getResourceManager, setResourceManager] = createContext<ResourceManager>();