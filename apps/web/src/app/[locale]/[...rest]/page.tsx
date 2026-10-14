import { notFound } from 'next/navigation';

// Unknown paths inside a locale render the localised not-found page.
export default function CatchAll() {
  notFound();
}
