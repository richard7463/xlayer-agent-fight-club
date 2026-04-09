import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Plus Jakarta Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Fira Code', 'Roboto Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))'
      },
      colors: {
        background: {
          DEFAULT: '#061423',
          dark: '#03111d',
        },
        primary: {
          DEFAULT: '#3BB5FF',
          foreground: '#ffffff',
        },
        destructive: {
          DEFAULT: '#EF4444', // 红色，用于 CTA 按钮和删除
          foreground: '#ffffff',
        },
        muted: {
          DEFAULT: '#f1f5f9',
          foreground: '#64748b',
        },
        accent: {
          DEFAULT: '#f1f5f9',
          foreground: '#0f172a',
        },
        popover: {
          DEFAULT: '#27272a',
          foreground: '#e0e0e6',
        },
        card: {
          DEFAULT: 'rgba(248,251,255,0.94)',
          foreground: '#0E2236',
        },
        border: {
          DEFAULT: 'rgba(150,186,216,0.18)',
        },
        input: {
          DEFAULT: '#e2e8f0',
        },
        ring: {
          DEFAULT: '#4C94E5',
        },
        // 自定义颜色，基于 page.tsx 中的常用颜色
        arena: {
          dark: '#0B1F33',
          'dark-text': '#cbe7ff',
          text: '#0e2236',
          'text-secondary': '#62819d',
          'hero-body': '#bfd9ef',
          'header-border': 'rgba(156,196,229,0.16)',
          'header-bg': 'rgba(8,20,34,0.72)',
          // Pill 背景色
          'pill-blue-bg': '#eef8ff',
          'pill-blue-text': '#2498ef',
          'pill-green-bg': '#ecfbf4',
          'pill-green-text': '#12b977',
          'pill-orange-bg': '#fff4e6',
          'pill-orange-text': '#e88a22',
          'pill-red-bg': '#fff1f1',
          'pill-red-text': '#d64f4f',
          'pill-gray-bg': '#eef3f6',
          'pill-gray-text': '#6a8094',
          // 排名卡片背景和边框
          'rank-card-bg': 'rgba(248,251,255,0.92)',
          'rank-card-border': '#d7e6f3',
          // 汇总卡片背景和边框
          'summary-card-bg': '#f3f9fd',
          'summary-card-border': '#d7e6f3',
          // Watchlist 卡片背景和边框
          'watchlist-card-bg': 'rgba(248,251,255,0.98)',
          'watchlist-card-border': '#d7e6f3',
          // Modal 背景和边框
          'modal-bg': '#f7fbff',
          'modal-border': '#d7e6f3',
          // Modal 按钮背景
          'modal-button-bg': '#ecf5fb',
          // Modal 预览背景
          'modal-preview-bg': '#f3f9fd',
          // Modal 预览文本
          'modal-preview-text': '#55718b',
          // No agents 边框和背景
          'no-agents-border': '#d7e6f3',
          'no-agents-bg': '#f6fbff',
          // 分隔线颜色
          'divider': '#dbe8f2',
          'divider-light': '#e9f2f8',
          // link hover
          'link-hover-border': '#a4d6f4',
          // locale switch
          'locale-switch-border': '#cfe0ec',
          'locale-switch-bg': 'rgba(247,251,255,0.94)',
          'locale-switch-text': '#648099',
          // workspace button
          'workspace-text': '#60788d',
          // eyebrow
          'eyebrow-border': 'rgba(93,177,255,0.22)',
          'eyebrow-bg': 'rgba(255,255,255,0.08)',
          // promotion score
          'promotion-score-text': '#18324c',
          // rank switcher
          'rank-switcher-border': '#d7e6f3',
          'rank-switcher-bg': '#f2f8fd',
          // text for simulation data
          'simulation-text': '#0f7f63',
          'simulation-bg': '#ecfbf4',
          'simulation-border': '#c9efe0',
          // info pill
          'info-pill-bg': 'rgba(255,255,255,0.08)',
          'info-pill-border': 'rgba(131,186,240,0.14)',
          'info-pill-text': '#85d8ff',
          'info-pill-body': '#d9ecfb',
          // create agent button
          'create-agent-shadow': '0_12px_30px_rgba(255,138,87,0.25)',
          // manage agents button
          'manage-agent-border': 'rgba(255,255,255,0.16)',
          'manage-agent-bg': 'rgba(255,255,255,0.08)',
          // active tab indicator
          'active-tab': '#0fb77a',
          // watchlist item color
          'watchlist-item-blue': '#DBEAFE',
          'watchlist-item-red': '#FEE2E2',
          'watchlist-item-green': '#D1FAE5',
          'watchlist-item-text': '#415c74',
          // delete button
          'delete-button-border': '#f2d4d4',
          'delete-button-bg': '#fff4f4',
          'delete-button-text': '#c85c5c',
          // 圆形头像/图标的背景色 (可以根据实际效果调整，这里只是示例)
          'avatar-bg-1': '#DBEAFE', // 蓝色系
          'avatar-text-1': '#1E40AF',
          'avatar-bg-2': '#FEE2E2', // 红色系
          'avatar-text-2': '#991B1B',
          'avatar-bg-3': '#D1FAE5', // 绿色系
          'avatar-text-3': '#065F46',
          'avatar-bg-4': '#EDE9FE', // 紫色系
          'avatar-text-4': '#5B21B6',
          'avatar-bg-5': '#FFEDD5', // 橙色系
          'avatar-text-5': '#9A3412',

          // PnL/ROI 正负颜色
          'pnl-positive': '#12b977',
          'pnl-negative': '#d64f4f',

          // Stability / Risk Adjusted 的色阶 (示例，可能需要更精细定义)
          'score-high': '#22C55E', // 绿色
          'score-medium': '#F59E0B', // 橙色
          'score-low': '#EF4444', // 红色
        },
      },
      lineClamp: {
        2: '2',
        4: '4',
      },
    }
  },
  daisyui: {},
  plugins: [
    require('postcss-import'), 
    require('@tailwindcss/typography'),
    require('@tailwindcss/line-clamp')
  ]
}
export default config
