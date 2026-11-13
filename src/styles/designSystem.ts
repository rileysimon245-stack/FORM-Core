/**
 * ============================================================================
 * FORM Core — Unified Design System
 * ============================================================================
 * Premium Dark Theme derived directly from reference card screenshot:
 * - App canvas background: #08100D
 * - Card surface: Rounded 28-32px, gradient from #10201A to #0A1310,
 *   top-left radial green glow, 1px border rgba(86,204,151,0.18), box-shadow 0 0 40px rgba(86,204,151,0.08)
 * - Accent color: Vibrant Mint #56CC97
 * - Icon Box: 14x14 (56px) / 12x12 (48px) squircle rounded-[20px], dark green #10221A, mint border, glow
 * - Sub-caption: UPPERCASE, tracking-widest (0.1em), text-[#6F8A7F] (gray-green), text-xs
 * - Title: UPPERCASE, font-black (800), text-[#F2F5F3], large with tight line-height
 * - Badge Pill: rounded-full px-3.5 py-1.5, dark green #10251C, mint border #56CC97/30, mint text
 * - Description: text-[#C9D3CE], text-sm/base, leading-relaxed (1.5)
 * - Chips / Tags: rounded-full, #12251E background, 1px border #1F3A30, light text #E2ECE7, px-4 py-2
 * - Primary CTA Button: w-full h-14/h-[58px], rounded-full, bg #56CC97, text #08100D, font-black, UPPERCASE, chevron ›, glow shadow
 */

export const DS = {
  colors: {
    bgPrimary: '#08100D',        // Dark green-tinted black canvas
    bgSecondary: '#0D1914',      // Drawer / secondary overlay background
    cardGradientFrom: '#10201A', // Card gradient top
    cardGradientTo: '#0A1310',   // Card gradient bottom
    cardInset: '#0B1712',        // Inner container surface
    cardAccentTint: '#12251E',   // Chip / tag background

    borderDefault: 'rgba(86, 204, 151, 0.18)',
    borderSubtle: '#1F3A30',
    borderActive: '#56CC97',

    mintPrimary: '#56CC97',      // Primary mint
    mintSoft: '#7DE0B0',
    mintDeep: '#10221A',
    mintGlow: 'rgba(86, 204, 151, 0.15)',

    textPrimary: '#F2F5F3',      // Bright crisp text
    textSecondary: '#C9D3CE',    // Light gray-green description text
    textSubCaption: '#6F8A7F',   // Gray-green uppercase label
    textMuted: '#587368',

    danger: '#E04848',
    dangerBg: '#281316',
    dangerBorder: '#522023',

    warning: '#E5A842',
    warningBg: '#271F11',
  },

  geometry: {
    radiusSm: 'rounded-xl',      // 12px
    radiusMd: 'rounded-2xl',     // 16px
    radiusLg: 'rounded-[20px]',  // 20px: icon squircles
    radiusXl: 'rounded-[28px] sm:rounded-[32px]', // 28-32px: cards
    radiusFull: 'rounded-full',  // pills & buttons
  },
} as const;

/**
 * Surface / Card Containers matching exact design prompt specification
 */
export const DS_CARD = {
  // Primary card matching screenshot
  base: 'relative overflow-hidden bg-gradient-to-b from-[#10201A] to-[#0A1310] border border-[#56CC97]/20 rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 shadow-[0_0_40px_rgba(86,204,151,0.08)] before:absolute before:top-0 before:left-0 before:w-48 before:h-48 before:bg-[radial-gradient(circle_at_top_left,rgba(86,204,151,0.14),transparent_70%)] before:pointer-events-none transition-all',
  
  // Elevated card for active elements
  elevated: 'relative overflow-hidden bg-gradient-to-b from-[#12241D] to-[#0B1612] border border-[#56CC97]/30 rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 shadow-[0_0_50px_rgba(86,204,151,0.12)] before:absolute before:top-0 before:left-0 before:w-56 before:h-56 before:bg-[radial-gradient(circle_at_top_left,rgba(86,204,151,0.18),transparent_70%)] before:pointer-events-none transition-all',
  
  // Interactive clickable card
  interactive: 'relative overflow-hidden bg-gradient-to-b from-[#10201A] to-[#0A1310] border border-[#56CC97]/20 hover:border-[#56CC97]/40 active:scale-[0.985] rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 shadow-[0_0_40px_rgba(86,204,151,0.08)] before:absolute before:top-0 before:left-0 before:w-48 before:h-48 before:bg-[radial-gradient(circle_at_top_left,rgba(86,204,151,0.14),transparent_70%)] before:pointer-events-none transition-all cursor-pointer',
  
  // Icon squircle matching prompt ("квадрат со скруглённым 20px, тёмно-зелёный фон, тонкая мятная граница, мягкое свечение")
  iconBox: 'w-12 h-12 sm:w-14 sm:h-14 rounded-[20px] bg-[#10221A] border border-[#56CC97]/30 text-[#56CC97] shadow-[0_0_20px_rgba(86,204,151,0.15)] flex items-center justify-center shrink-0',
  
  // Secondary wide capsule bar
  secondaryBar: 'rounded-full bg-[#10221A] border border-[#1F3A30] hover:border-[#56CC97]/30 py-3.5 px-5 flex items-center justify-between text-xs sm:text-sm font-bold text-[#E2ECE7] shadow-md transition-all cursor-pointer active:scale-[0.99]',
  
  // Inner row box
  insetRow: 'bg-[#0B1712] border border-[#1E362C] rounded-2xl p-3.5',
  
  // Compact card
  compact: 'relative overflow-hidden bg-gradient-to-b from-[#10201A] to-[#0A1310] border border-[#56CC97]/20 rounded-2xl p-4 shadow-[0_0_30px_rgba(86,204,151,0.06)]',
};

/**
 * Button Styles matching exact prompt specification
 */
export const DS_BUTTON = {
  // Primary CTA Button ("во всю ширину, пилюля, фон мятный #56CC97, текст чёрный, жирный, КАПСОМ, справа шеврон ›, высота 56-60px, лёгкое свечение")
  primary: 'w-full h-14 sm:h-[58px] rounded-full bg-[#56CC97] hover:bg-[#62d6a1] text-[#08100D] font-black text-xs sm:text-sm uppercase tracking-wider shadow-[0_4px_24px_rgba(86,204,151,0.25)] active:scale-[0.98] active:brightness-95 transition-all flex items-center justify-center gap-2 cursor-pointer select-none',
  
  // Secondary pill button
  secondary: 'py-3.5 px-5 bg-[#12251E] hover:bg-[#183127] border border-[#1F3A30] text-[#E2ECE7] font-bold text-xs sm:text-sm rounded-full active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer select-none',
  
  // Accent soft outline button
  accentSoft: 'py-3.5 px-5 bg-[#10251C] border border-[#56CC97]/30 hover:border-[#56CC97] text-[#56CC97] font-bold text-xs sm:text-sm rounded-full active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer select-none',
  
  // White pill button
  whitePill: 'rounded-full bg-white hover:bg-[#E8EAEB] text-[#08100D] px-6 py-3 font-black text-xs uppercase tracking-wider shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none',
  
  // Circular white button
  whiteCircle: 'w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer select-none',
  
  // Circular dark button
  darkCircle: 'w-11 h-11 rounded-full bg-[#10221A] border border-[#1F3A30] text-[#E2ECE7] hover:bg-[#183127] flex items-center justify-center active:scale-95 transition-all cursor-pointer select-none',
  
  // Danger button
  danger: 'py-3.5 px-5 bg-[#281316] border border-[#522023] text-[#E04848] font-bold text-xs sm:text-sm rounded-full hover:border-[#E04848] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer select-none',
  
  // Circular checkbox - completed
  checkActive: 'w-10 h-10 rounded-full bg-[#56CC97] text-[#08100D] flex items-center justify-center shadow-[0_0_16px_rgba(86,204,151,0.4)] cursor-pointer active:scale-95 transition-all shrink-0',
  
  // Circular checkbox - inactive
  checkInactive: 'w-10 h-10 rounded-full border-2 border-[#1F3A30] bg-transparent hover:border-[#56CC97] flex items-center justify-center cursor-pointer active:scale-95 transition-all shrink-0',
};

/**
 * Chips / Tags ("пилюли, тёмно-зелёный фон #12251E, граница 1px #1F3A30, светлый текст, padding 10px 18px")
 */
export const DS_CHIP = 'inline-flex items-center px-4 py-2 bg-[#12251E] border border-[#1F3A30] rounded-full text-xs sm:text-sm font-medium text-[#E2ECE7] whitespace-nowrap';

/**
 * Badges & Pills
 */
export const DS_BADGE = {
  // Top-right pill badge ("тёмно-зелёный фон #10251C, мятная граница #56CC97/30, мятный жирный текст")
  pill: 'inline-flex items-center px-3.5 py-1.5 bg-[#10251C] border border-[#56CC97]/30 rounded-full text-xs font-bold text-[#56CC97] shadow-xs',
  category: 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#12251E] border border-[#1F3A30] text-xs font-semibold text-[#C9D3CE]',
  amber: 'inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#271F11] border border-[#543E19] rounded-full text-xs font-bold text-[#E5A842]',
  danger: 'inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#281316] border border-[#522023] rounded-full text-xs font-bold text-[#E04848]',
};

/**
 * Inputs & Form Controls
 */
export const DS_INPUT = {
  text: 'h-12 px-4 bg-[#0B1712] border border-[#1F3A30] focus:border-[#56CC97] focus:ring-1 focus:ring-[#56CC97]/30 text-[#F2F5F3] placeholder-[#6F8A7F] text-xs sm:text-sm font-medium rounded-2xl outline-none transition-all',
  numeric: 'h-12 px-3 bg-[#0B1712] border border-[#1F3A30] focus:border-[#56CC97] focus:ring-1 focus:ring-[#56CC97]/30 text-center font-mono text-base font-bold text-[#F2F5F3] placeholder-[#6F8A7F] rounded-2xl outline-none transition-all tabular-nums',
  textarea: 'p-4 bg-[#0B1712] border border-[#1F3A30] focus:border-[#56CC97] focus:ring-1 focus:ring-[#56CC97]/30 text-[#F2F5F3] placeholder-[#6F8A7F] text-xs sm:text-sm font-medium rounded-2xl outline-none transition-all resize-none',
};

/**
 * Modals & Overlay Surfaces
 */
export const DS_MODAL = {
  backdrop: 'fixed inset-0 z-50 bg-black/65 backdrop-blur-md flex items-center justify-center p-3.5 sm:p-5 select-none font-sans',
  dialog: 'w-full max-w-md bg-gradient-to-b from-[#10201A] to-[#0A1310] border border-[#56CC97]/25 rounded-[32px] max-h-[88vh] flex flex-col overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.85)] text-[#F2F5F3]',
  header: 'px-5 py-4 border-b border-[#1F3A30] flex items-center justify-between bg-[#10201A]',
  title: 'text-sm sm:text-base font-black uppercase text-[#F2F5F3] flex items-center gap-2 truncate tracking-wide',
  body: 'flex-1 overflow-y-auto p-5 space-y-4 no-scrollbar',
  footer: 'p-4 sm:p-5 border-t border-[#1F3A30] bg-[#0A1310] flex items-center gap-2.5',
};

/**
 * Typography Tokens matching prompt specs
 */
export const DS_TYPO = {
  subCaption: 'uppercase tracking-[0.1em] text-xs sm:text-[13px] font-bold text-[#6F8A7F]',
  cardTitle: 'uppercase font-black text-[#F2F5F3] text-2xl sm:text-3xl leading-none tracking-tight',
  h1: 'text-2xl sm:text-3xl font-black uppercase tracking-tight text-[#F2F5F3] leading-tight',
  h2: 'text-xl sm:text-2xl font-black uppercase tracking-tight text-[#F2F5F3] leading-snug',
  h3: 'text-base sm:text-lg font-extrabold uppercase text-[#F2F5F3]',
  description: 'text-sm sm:text-base text-[#C9D3CE] leading-relaxed font-normal',
  body: 'text-xs sm:text-sm text-[#C9D3CE] leading-relaxed',
  caption: 'text-[11px] font-semibold text-[#6F8A7F]',
  metric: 'font-mono tabular-nums font-black tracking-tight text-white',
  sectionLabel: 'text-xs font-bold uppercase tracking-[0.1em] text-[#6F8A7F] px-1',
};
