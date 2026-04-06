import { createContext } from "svelte";

export interface Command {
    id: string;
    label: string;
    description?: string;
    keybinding?: string;
    keybindingHandler?: (e: KeyboardEvent) => boolean;
    action: () => void | Promise<void>;
}

export class CommandRegistry {
    #commands = $state(new Map<string, Command>());

    register(command: Command): () => void {
        this.#commands.set(command.id, command);
        return () => this.unregister(command.id);
    }

    unregister(id: string) {
        this.#commands.delete(id);
    }

    get commands(): Command[] {
        return [...this.#commands.values()];
    }

    search(query: string): Command[] {
        const all = this.commands;
        if (!query.trim()) return all;
        const q = query.toLowerCase();
        return all.filter(
            (c) =>
                c.label.toLowerCase().includes(q) ||
                c.description?.toLowerCase().includes(q) ||
                c.id.toLowerCase().includes(q)
        );
    }
}

export const [useCommandRegistry, setCommandRegistry] = createContext<CommandRegistry>();
