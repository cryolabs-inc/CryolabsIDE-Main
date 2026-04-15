export interface DialogOptions {
	title: string;
	content: string | HTMLElement;
	buttons?: DialogButton[];
	closable?: boolean;
	modal?: boolean;
	onClose?: () => void;
}

export interface DialogButton {
	label: string;
	action: () => void | Promise<void>;
	variant?: 'primary' | 'secondary' | 'danger';
}

export interface AutocompleteSuggestion {
	value: string;
	label?: string;
	description?: string;
}

export interface AutocompleteProvider {
	getSuggestions(input: string): AutocompleteSuggestion[] | Promise<AutocompleteSuggestion[]>;
}

export interface PromptOptions {
	title: string;
	message: string;
	inputType?: 'text' | 'password' | 'number' | 'email' | 'textarea';
	placeholder?: string;
	defaultValue?: string;
	required?: boolean;
	validation?: (value: string) => boolean | string;
	autocomplete?: AutocompleteProvider;
	submitOnEnter?: boolean;
	buttons?: {
		confirm?: string;
		cancel?: string;
	};
}

export interface Dialog {
	id: string;
	options: DialogOptions;
	close: () => void;
}

export type FilePickerMode = 'file' | 'directory' | 'both';

export interface FilePickerOptions {
	title?: string;
	rootDir: string;
	mode?: FilePickerMode;
	confirmOnClick?: boolean;
	saveAs?: boolean;
	/** When true, the Cancel button is hidden — the user must make a valid selection. */
	required?: boolean;
}

export interface DialogManager {
	/**
	 * Show a dialog with the given options
	 */
	showDialog(options: DialogOptions): Promise<Dialog>;

	/**
	 * Show a prompt dialog and return the user input
	 */
	showPrompt(options: PromptOptions): Promise<string | null>;

	/**
	 * Show a confirmation dialog
	 */
	confirm(title: string, message: string): Promise<boolean>;

	/**
	 * Show an alert dialog
	 */
	alert(title: string, message: string): Promise<void>;

	/**
	 * Show a file picker dialog and return the selected path
	 */
	showFilePicker(options: FilePickerOptions): Promise<string | null>;

	/**
	 * Close a specific dialog by ID
	 */
	closeDialog(id: string): void;

	/**
	 * Close all open dialogs
	 */
	closeAll(): void;

	/**
	 * Get all open dialogs
	 */
	getOpenDialogs(): Dialog[];
}
