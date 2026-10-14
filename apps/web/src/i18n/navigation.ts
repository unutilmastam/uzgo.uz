import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/** Locale-aware Link and router. Always use these instead of next/link in the app. */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
