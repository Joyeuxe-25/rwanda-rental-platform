import type { Metadata } from 'next';

/**
 * The design-system showcase is a developer reference, not a product page — keep
 * it out of search indexes (F9 QA). A tiny server-component layout applies the
 * `noindex` metadata that the `'use client'` page itself cannot export.
 */
export const metadata: Metadata = {
  title: 'Design system',
  robots: { index: false, follow: false },
};

export default function DesignSystemLayout({ children }: { children: React.ReactNode }) {
  return children;
}
