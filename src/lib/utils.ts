import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, "child"> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, "children"> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
export interface ExtendablePromise<T> {
	promise: Promise<T>;
	Resolve: (val: T)=>void;
}
export function ConstructExtendablePromise<T = void>() {
    let Resolve: (val: T) => void = (va) => { };
    let promise = new Promise((resolve => {
        Resolve = resolve;
    }));
    return { promise, Resolve } as ExtendablePromise<T>;
}