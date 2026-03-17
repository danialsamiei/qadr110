const EXACT_REPLACEMENTS = new Map([
  ['MIROFISH', 'QADRPredict'],
  ['MiroFish', 'QADRPredict'],
  ['Prediction Report', 'گزارش پیش بینی'],
  ['Interactive Tools', 'ابزارهای تعاملی'],
  ['Waiting for Report Agent...', 'در انتظار عامل گزارش...'],
  ['Refresh', 'به روزرسانی'],
  ['Graph Relationship Visualization', 'نمای روابط گراف'],
  ['Node Details', 'جزئیات گره'],
  ['Relationship', 'رابطه'],
  ['Name:', 'نام:'],
  ['UUID:', 'شناسه:'],
  ['Created:', 'ایجاد شده:'],
  ['Properties:', 'ویژگی ها:'],
  ['Summary:', 'خلاصه:'],
  ['Labels:', 'برچسب ها:'],
  ['Label:', 'برچسب:'],
  ['Type:', 'نوع:'],
  ['Fact:', 'فکت:'],
  ['Episodes:', 'اپیزودها:'],
  ['Valid From:', 'معتبر از:'],
  ['Invalid At:', 'نامعتبر در:'],
  ['Expired At:', 'منقضی در:'],
  ['Relationship', 'رابطه'],
  ['Step 1/5', 'مرحله 1 از 5'],
  ['Step 2/5', 'مرحله 2 از 5'],
  ['Step 4/5', 'مرحله 4 از 5'],
  ['Step 5/5', 'مرحله 5 از 5'],
  ['Error', 'خطا'],
  ['Ready', 'آماده'],
  ['Processing', 'در حال پردازش'],
  ['Completed', 'تکمیل'],
  ['Preparing', 'در حال آماده سازی'],
  ['Generating', 'در حال تولید'],
  ['Available Actions', 'اقدام های در دسترس'],
  ['Elapsed Time', 'زمان سپری شده'],
  ['Search Query:', 'عبارت جستجو:'],
  ['Action Skipped', 'این دور بدون اقدام گذشت'],
  ['Reposted from @', 'بازنشر از @'],
  ['Liked @', 'پسندیدن @'],
  ['Followed @', 'دنبال کرد @'],
  ['Upvoted Post', 'رای مثبت به پست'],
  ['Downvoted Post', 'رای منفی به پست'],
  ['TOTAL EVENTS:', 'کل رویدادها:'],
  ['Sections', 'بخش ها'],
  ['Elapsed', 'مدت اجرا'],
  ['Tools', 'ابزارها'],
  ['SECTIONS', 'بخش ها'],
  ['Requirement', 'نیاز تحلیلی'],
  ['Simulation', 'شبیه سازی'],
  ['Report Agent - Chat', 'گفتگو با عامل گزارش'],
  ['agents available', 'عامل در دسترس'],
  ['GraphRAG长短期记忆实时更新中', 'حافظه کوتاه مدت و بلندمدت GraphRAG در حال به روزرسانی است'],
  ['图谱', 'نمودار'],
  ['双栏', 'دو ستونه'],
  ['工作台', 'کارگاه'],
  ['图谱构建', 'ساخت گراف'],
  ['环境搭建', 'آماده سازی محیط'],
  ['开始模拟', 'اجرای شبیه سازی'],
  ['报告生成', 'تولید گزارش'],
  ['深度互动', 'تعامل عمیق'],
  ['实时知识图谱', 'گراف دانش زنده'],
  ['构建流程', 'جریان ساخت'],
  ['本体生成', 'تولید هستی شناسی'],
  ['图谱构建中', 'گراف در حال ساخت است'],
  ['等待本体生成', 'در انتظار تولید هستی شناسی'],
  ['数据即将显示...', 'داده ها به زودی نمایش داده می شوند...'],
  ['实时更新中...', 'در حال به روزرسانی زنده...'],
  ['系统状态', 'وضعیت سامانه'],
  ['准备就绪', 'آماده برای تحلیل'],
  ['工作流序列', 'مسیر اجرای سامانه'],
  ['加载中...', 'در حال بارگذاری...'],
  ['推演记录', 'سابقه شبیه سازی'],
  ['模拟需求', 'نیاز شبیه سازی'],
  ['关联文件', 'فایل های مرتبط'],
  ['暂无关联文件', 'هنوز فایلی ثبت نشده است'],
  ['推演回放', 'بازپخش شبیه سازی'],
  ['分析报告', 'گزارش تحلیلی'],
  ['无', 'ندارد'],
  ['高峰时段', 'بازه اوج'],
  ['工作时段', 'بازه کاری'],
  ['早间时段', 'بازه صبحگاهی'],
  ['低谷时段', 'بازه کم فعالیت'],
  ['模拟时长', 'مدت شبیه سازی'],
  ['每轮时长', 'مدت هر دور'],
  ['总轮次', 'تعداد کل دورها'],
  ['每小时活跃', 'فعالیت در هر ساعت'],
  ['Agent 配置', 'پیکربندی عامل ها'],
  ['当前Agent数', 'تعداد عامل های فعلی'],
  ['预期Agent总数', 'برآورد کل عامل ها'],
  ['现实种子当前关联话题数', 'تعداد موضوع های پیوندخورده با بذر واقعیت'],
  ['已生成的 Agent 人设', 'پروفایل های تولیدشده عامل ها'],
  ['未知职业', 'حرفه نامشخص'],
  ['暂无简介', 'هنوز توضیحی ثبت نشده است'],
  ['生成双平台模拟配置', 'تولید پیکربندی شبیه سازی'],
  ['Simulation ID', 'شناسه شبیه سازی'],
  ['Task ID', 'شناسه وظیفه'],
  ['Project ID', 'شناسه پروژه'],
  ['Graph ID', 'شناسه گراف'],
  ['异步任务已完成', 'وظیفه ناهمگام تکمیل شده است'],
])

const SUBSTRING_REPLACEMENTS = [
  ['访问我们的Github主页', 'مشاهده مخزن مبنا در GitHub'],
  ['简洁通用的群体智能引擎', 'موتور چندعاملی و پیش بینی سناریو'],
  ['上传任意报告', 'بارگذاری گزارش یا سند'],
  ['即刻推演未来', 'پیش نویسی آینده های محتمل'],
  ['拖拽文件上传', 'فایل را بکشید و رها کنید'],
  ['或点击浏览文件系统', 'یا برای انتخاب فایل کلیک کنید'],
  ['输入参数', 'تنظیم پارامترها'],
  ['模拟提示词', 'دستور تحلیل و شبیه سازی'],
  ['启动引擎', 'شروع موتور'],
  ['初始化中...', 'در حال مقداردهی اولیه...'],
  ['刷新图谱', 'به روزرسانی گراف'],
  ['退出全屏', 'خروج از تمام صفحه'],
  ['全屏显示', 'تمام صفحه'],
  ['图谱数据加载中...', 'داده های گراف در حال بارگذاری است...'],
  ['生成完成后将自动开始构建图谱', 'پس از تکمیل، ساخت گراف به شکل خودکار آغاز می شود'],
  ['Report Agent', 'عامل گزارش'],
  ['Interactive', 'تعاملی'],
  ['与Report Agent对话', 'گفتگو با عامل گزارش'],
  ['与世界中任意个体对话', 'گفتگو با هر عامل در جهان شبیه سازی'],
  ['发送问卷调查到世界中', 'ارسال پیمایش به جهان شبیه سازی'],
  ['选择对话对象', 'انتخاب مخاطب گفتگو'],
  ['简介', 'معرفی'],
  ['与模拟个体对话，了解他们的观点', 'با عامل های شبیه سازی گفتگو کنید و دیدگاه آن ها را ببینید'],
  ['与 Report Agent 对话，深入了解报告内容', 'با عامل گزارش گفتگو کنید و لایه های گزارش را بررسی کنید'],
  ['开始生成结果报告', 'شروع تولید گزارش نهایی'],
  ['启动中...', 'در حال شروع...'],
  ['进入深度互动', 'ورود به تعامل عمیق'],
  ['选择对话对象', 'انتخاب مخاطب گفتگو'],
  ['加载报告数据', 'بارگذاری داده گزارش'],
  ['项目加载成功', 'پروژه با موفقیت بارگذاری شد'],
  ['图谱加载失败', 'بارگذاری گراف شکست خورد'],
  ['图谱数据加载成功', 'داده های گراف بارگذاری شد'],
]

const ATTRIBUTE_NAMES = ['placeholder', 'title', 'aria-label']

function translateText(value) {
  if (!value || !value.trim()) return value
  if (EXACT_REPLACEMENTS.has(value.trim())) {
    return EXACT_REPLACEMENTS.get(value.trim())
  }

  let result = value
  for (const [from, to] of SUBSTRING_REPLACEMENTS) {
    result = result.split(from).join(to)
  }

  result = result
    .replace(/Step (\d+)\/5/g, 'مرحله $1 از 5')
    .replace(/(\d+)\s*节点/g, '$1 گره')
    .replace(/(\d+)\s*关系/g, '$1 رابطه')
    .replace(/\+(\d+)\s*个文件/g, '+$1 فایل')
    .replace(/\/ v0\.1-预览版/g, '/ نسخه پیش نمایش')
    .replace(/Round/gi, 'دور')

  return result
}

function localizeTextNode(node) {
  if (!node.nodeValue) return
  const translated = translateText(node.nodeValue)
  if (translated !== node.nodeValue) {
    node.nodeValue = translated
  }
}

function localizeElementAttributes(element) {
  for (const attr of ATTRIBUTE_NAMES) {
    const current = element.getAttribute(attr)
    if (!current) continue
    const translated = translateText(current)
    if (translated !== current) {
      element.setAttribute(attr, translated)
    }
  }
}

function walkAndLocalize(root) {
  if (!root) return
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    localizeTextNode(node)
    node = walker.nextNode()
  }

  if (root instanceof Element) {
    localizeElementAttributes(root)
    root.querySelectorAll('*').forEach((element) => localizeElementAttributes(element))
  }
}

export function installPersianUiLocalization(root = document.body) {
  walkAndLocalize(root)

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          localizeTextNode(node)
          return
        }
        if (node instanceof Element) {
          walkAndLocalize(node)
        }
      })
      if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
        localizeTextNode(mutation.target)
      }
    }
  })

  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
  })

  return () => observer.disconnect()
}
