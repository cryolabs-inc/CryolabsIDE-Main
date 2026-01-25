import type { Component, ComponentProps } from "svelte";
import RawTextViewer from "./viewers/RawTextViewer.svelte";

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
type a<T extends unknown[]> = Extract<Resource<T>,ResourceMember<T, "data">>;
// --- Response class ---
type TheExtracted<T, K extends keyof Rmap<unknown[]>> = T extends Rmap<infer params> ? Rmap<params>[K] : never;

type ToResource = <K extends keyof Rmap<T>, T extends unknown[] = []>(type: K, val: TheExtracted<Rmap<T>, K>)=>ResourceMember<T, K>

const toResource: ToResource = (type, dat)=>{
    return{
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

    static ok<R extends unknown[], K extends keyof Rmap<R>>(type: K, resource: TheExtracted<Rmap<R>, K>): ResourceResponse<R> {
        return new ResourceResponse<R>(200, "OK", { resource: toResource<K, R>(type, resource) as Resource<R>});
    }
    
}
ResourceResponse.ok("panel", {

} as ResourcePanel<[typeof RawTextViewer]>);

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
            if (dat) {
                return new ResourceResponse<[typeof RawTextViewer]>(response.status, response.statusMessage, {resource: {
                    type: "panel",
                    data: {
                        component: RawTextViewer,
                        props: {
                            dat: new Uint8Array(await dat.arrayBuffer())
                        }
                    }
                }});
            }
        }
        return ResourceResponse.notFound();
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
}

// --- Default instance ---

export const resourceManager = new ResourceManager()
    .registerScheme("http", new HttpHandler())
    .registerScheme("https", new HttpHandler())

// Convenience export
export const resourceFetch = resourceManager.fetch.bind(resourceManager);
console.log(resourceFetch);