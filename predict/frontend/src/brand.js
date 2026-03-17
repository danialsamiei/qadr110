export const APP_BRAND = 'QADRPredict'
export const APP_TAGLINE = 'کارگاه فارسی پیش بینی، شبیه سازی و گزارش سازی QADR'
export const RETURN_TO_QADR_LABEL = 'بازگشت به QADR110'

export const VIEW_MODE_LABELS = {
  graph: 'نمودار',
  split: 'دو ستونه',
  workbench: 'کارگاه',
}

export const STEP_NAMES = [
  'ساخت گراف',
  'آماده سازی محیط',
  'اجرای شبیه سازی',
  'تولید گزارش',
  'تعامل عمیق',
]

export const STATUS_LABELS = {
  ready: 'آماده',
  processing: 'در حال پردازش',
  completed: 'تکمیل',
  error: 'خطا',
  initializing: 'در حال آماده سازی',
  building: 'در حال ساخت',
  generating: 'در حال تولید',
}

export function stepLabel(index) {
  return STEP_NAMES[index - 1] || 'مرحله'
}
