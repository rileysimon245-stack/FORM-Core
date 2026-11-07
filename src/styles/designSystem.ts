/**
 * ============================================================================
 * FORM Core — Unified Design System
 * ============================================================================
 * Premium Minimalist Dark Theme with Deep Graphite and Mint Accent.
 * Tailored for tactile, high-performance Android-native look and feel.
 */

export const DS = {
  // 1. Color Palette Tokens
  colors: {
    // Primary canvas & surfaces
    bgPrimary: '#080D0E',        // Deep neutral graphite background
    bgSecondary: '#0E1416',      // Slightly elevated secondary background (modals, drawers)
    cardSurface: '#121A1C',      // Default card surface (clean contrast against canvas)
    cardElevated: '#162124',     // Elevated card / toolbars / active items
    cardSubtle: '#0F1618',       // Subdued card / inset list rows
    cardAccentTint: '#11241C',   // Soft mint-tinted surface for active / highlighted states

    // Hairline borders and dividers
    borderDefault: '#1C2628',    // Standard subtle container border
    borderSubtle: '#161F21',     // Inset list divider
    borderElevated: '#232F32',   // Border on elevated surfaces
    borderActive: '#31644E',     // Muted mint accent border
    borderFocus: '#58C995',      // Bright mint focus border

    // Brand Mint Accents
    mintPrimary: '#58C995',      // Hero vibrant mint (CTAs, key highlights, progress)
    mintSoft: '#83D9AE',         // Soft mint for secondary icons & subdued values
    mintDeep: '#31644E',         // Deep forest/mint for borders and gradients
    mintGlow: 'rgba(88, 201, 149, 0.14)',

    // Secondary Accents
    steelBlue: '#6E8A95',        // Technical secondary info
    trophyGold: '#E5B842',       // Personal records / awards

    // Semantic States
    success: '#58C995',
    successBg: '#11241C',
    successBorder: '#2A5943',

    warning: '#E5A842',
    warningBg: '#271F11',
    warningBorder: '#543E19',

    danger: '#E04848',
    dangerBg: '#261315',
    dangerBorder: '#522023',

    // Text Hierarchy
    textPrimary: '#F0F3F2',      // Crisp near-white
    textSecondary: '#9AA3A5',    // Medium legible neutral
    textMuted: '#5F6B6E',        // Dark muted for captions / inactive tabs
    textAccent: '#58C995',       // Mint text highlight
  },

  // 2. Geometry Scale
  geometry: {
    radiusSm: 'rounded-lg',      // 8px: small tags, inner badges
    radiusMd: 'rounded-xl',      // 12px: buttons, inputs, list items
    radiusLg: 'rounded-2xl',     // 16px: cards, dialogue surfaces
    radiusXl: 'rounded-3xl',     // 24px: bottom sheets top edge
    radiusFull: 'rounded-full',  // 9999px: pills, avatars, switch thumbs

    btnHeightSm: 'h-8 min-h-[32px]',
    btnHeightMd: 'h-11 min-h-[44px]',
    btnHeightLg: 'h-12 min-h-[48px]',
  },
} as const;

// 3. Reusable Class Name Bundles for Common Components

/**
 * Surface / Card Containers
 */
export const DS_CARD = {
  // Standard card with subtle graphite border
  base: 'bg-[#121A1C] border border-[#1C2628] rounded-2xl p-4 transition-colors',
  // Elevated card for key metrics or focused modules
  elevated: 'bg-[#162124] border border-[#232F32] rounded-2xl p-4 shadow-xl shadow-black/25',
  // Interactive clickable card with hover/active response
  interactive: 'bg-[#121A1C] border border-[#1C2628] hover:border-[#31644E] active:scale-[0.985] rounded-2xl p-4 transition-all cursor-pointer',
  // Highlighted card (e.g., active workout, current program)
  highlight: 'bg-[#11241C] border border-[#2A5943] rounded-2xl p-4',
  // Inset row item inside a card
  insetRow: 'bg-[#0F1618] border border-[#161F21] rounded-xl p-3',
  // Minimal card padding for compact viewports
  compact: 'bg-[#121A1C] border border-[#1C2628] rounded-xl p-3',
};

/**
 * Button Styles
 */
export const DS_BUTTON = {
  // Primary CTA (Vibrant Mint)
  primary: 'h-11 px-4 bg-[#58C995] text-[#080D0E] font-bold text-xs rounded-xl shadow-md shadow-[#58C995]/15 hover:bg-[#68D8A3] active:scale-[0.97] transition-all flex items-center justify-center gap-2 cursor-pointer select-none',
  // Secondary standard button
  secondary: 'h-11 px-4 bg-[#162124] border border-[#232F32] text-[#F0F3F2] font-semibold text-xs rounded-xl hover:border-[#31644E] active:scale-[0.97] transition-all flex items-center justify-center gap-2 cursor-pointer select-none',
  // Soft mint outline button
  accentSoft: 'h-11 px-4 bg-[#11241C] border border-[#2A5943] text-[#58C995] font-bold text-xs rounded-xl hover:border-[#58C995] active:scale-[0.97] transition-all flex items-center justify-center gap-2 cursor-pointer select-none',
  // Danger button (delete, abort)
  danger: 'h-11 px-4 bg-[#261315] border border-[#522023] text-[#E04848] font-bold text-xs rounded-xl hover:border-[#E04848] active:scale-[0.97] transition-all flex items-center justify-center gap-2 cursor-pointer select-none',
  // Compact ghost button (toolbar actions, close icons)
  ghost: 'h-9 px-3 text-[#9AA3A5] hover:text-[#F0F3F2] hover:bg-[#162124] font-medium text-xs rounded-lg active:scale-[0.97] transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none',
  // Circular icon action button
  icon: 'w-10 h-10 min-w-[40px] rounded-xl bg-[#162124] border border-[#232F32] text-[#9AA3A5] hover:text-[#F0F3F2] hover:border-[#31644E] active:scale-[0.95] flex items-center justify-center transition-all cursor-pointer',
  // Circular mint icon action button
  iconAccent: 'w-10 h-10 min-w-[40px] rounded-xl bg-[#11241C] border border-[#2A5943] text-[#58C995] active:scale-[0.95] flex items-center justify-center transition-all cursor-pointer',
};

/**
 * Inputs & Form Controls
 */
export const DS_INPUT = {
  // Standard text input
  text: 'h-11 px-3.5 bg-[#0A1012] border border-[#1C2628] focus:border-[#58C995] focus:ring-1 focus:ring-[#58C995]/25 text-[#F0F3F2] placeholder-[#5F6B6E] text-xs font-medium rounded-xl outline-none transition-all',
  // Numeric metric input (weight, reps, sets)
  numeric: 'h-11 px-3 bg-[#0A1012] border border-[#1C2628] focus:border-[#58C995] focus:ring-1 focus:ring-[#58C995]/25 text-center font-mono text-sm font-bold text-[#F0F3F2] placeholder-[#5F6B6E] rounded-xl outline-none transition-all tabular-nums',
  // Textarea
  textarea: 'p-3 bg-[#0A1012] border border-[#1C2628] focus:border-[#58C995] focus:ring-1 focus:ring-[#58C995]/25 text-[#F0F3F2] placeholder-[#5F6B6E] text-xs font-medium rounded-xl outline-none transition-all resize-none',
};

/**
 * Badges & Micro Statuses
 */
export const DS_BADGE = {
  mint: 'px-2.5 py-1 bg-[#11241C] border border-[#2A5943] rounded-lg text-[11px] font-bold text-[#58C995]',
  amber: 'px-2.5 py-1 bg-[#271F11] border border-[#543E19] rounded-lg text-[11px] font-bold text-[#E5A842]',
  danger: 'px-2.5 py-1 bg-[#261315] border border-[#522023] rounded-lg text-[11px] font-bold text-[#E04848]',
  neutral: 'px-2.5 py-1 bg-[#162124] border border-[#232F32] rounded-lg text-[11px] font-medium text-[#9AA3A5]',
};

/**
 * Modals & Overlay Surfaces
 */
export const DS_MODAL = {
  backdrop: 'fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4',
  dialog: 'w-full max-w-md bg-[#0E1416] border-t sm:border border-[#1C2628] rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl',
  header: 'px-4 py-3.5 border-b border-[#161F21] flex items-center justify-between bg-[#121A1C]',
  title: 'text-sm font-bold text-[#F0F3F2] flex items-center gap-2 truncate',
  body: 'flex-1 overflow-y-auto p-4 space-y-4',
  footer: 'p-4 border-t border-[#161F21] bg-[#121A1C] flex items-center gap-2',
};

/**
 * Typography Constants
 */
export const DS_TYPO = {
  h1: 'text-xl font-bold tracking-tight text-[#F0F3F2]',
  h2: 'text-base font-bold tracking-tight text-[#F0F3F2]',
  h3: 'text-sm font-semibold text-[#F0F3F2]',
  body: 'text-xs text-[#9AA3A5] leading-relaxed',
  caption: 'text-[11px] font-medium text-[#5F6B6E]',
  metric: 'font-mono tabular-nums font-bold tracking-tight text-[#F0F3F2]',
  sectionLabel: 'text-[11px] font-bold uppercase tracking-wider text-[#9AA3A5] px-1',
};
