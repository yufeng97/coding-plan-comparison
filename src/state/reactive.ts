import { reactive } from 'vue';

/* Vue components and domain actions share the same reactive state. */
export function appState<T extends object>(value: T): T {
    return reactive(value) as T;
}
