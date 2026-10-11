import { reactive } from 'vue';
import type { ThemeMode } from '../domain/view-types';
export const themeView = reactive<{ mode: ThemeMode; effective: 'dark' | 'light' }>({ mode: 'system', effective: 'light' });
