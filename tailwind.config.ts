import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      typography: {
        DEFAULT: {
          css: {
            '--tw-prose-body': '#4b5563',
            '--tw-prose-headings': '#111827',
            '--tw-prose-links': '#ec4899',
            '--tw-prose-bold': '#111827',
            '--tw-prose-code': '#111827',
            '--tw-prose-pre-bg': '#f6f8fa',
            '--tw-prose-pre-code': '#1f2937',
            '--tw-prose-th-borders': '#e5e7eb',
            '--tw-prose-td-borders': '#e5e7eb',
            fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
            a: {
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
              '&:hover': {
                color: '#db2777',
              },
            },
            code: {
              backgroundColor: '#f0f2f5',
              padding: '0.125rem 0.375rem',
              borderRadius: '0.25rem',
              fontSize: '0.8125em',
              fontWeight: '400',
              '&::before': { content: 'none' },
              '&::after': { content: 'none' },
            },
            pre: {
              backgroundColor: '#f6f8fa',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
              fontSize: '0.75rem',
            },
            'pre code': {
              backgroundColor: 'transparent',
              padding: '0',
              borderRadius: '0',
            },
            table: {
              fontSize: '0.8125rem',
            },
            th: {
              fontWeight: '600',
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.025em',
              color: '#6b7280',
            },
          },
        },
      },
    },
  },
  plugins: [typography],
};
export default config;
