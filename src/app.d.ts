// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
	type ItemPanelItem = {
		
		inner?: Component;
		innerIconURL?: string;
		tooltip?: string;
		key: string;

	}
}

export { };
