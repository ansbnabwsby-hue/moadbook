# moadbook — الموقع العربي

موقع moadbook الاجتماعي بواجهة عربية RTL، مبني على Expo Router وReact Native Web وTypeScript. يعيد استخدام واجهات التطبيق الحالية ويرتبط بمشروع Firebase نفسه للمصادقة وRealtime Database؛ لم تُنشأ قاعدة بديلة ولم تُغيّر قواعد Firebase.

## الموقع والتثبيت على iPhone

بعد نجاح سير GitHub Pages سيكون الموقع متاحًا على: <https://ansbnabwsby-hue.github.io/moadbook/>

على iPhone افتح الرابط في Safari، ثم اختر **مشاركة → إضافة إلى الشاشة الرئيسية**. يدعم الموقع manifest وservice worker، ويحفظ نسخة shell وملفات الواجهة فقط. بيانات الحسابات والمنشورات والمحادثات لا تُخزّن محليًا؛ يلزم الاتصال بالإنترنت للوصول إلى Firebase.

## المصدر

مصدر التطبيق الكامل وملفات Expo في [`moadbook-web/`](./moadbook-web/). تحديثات الفرع `main` تشغّل GitHub Actions، الذي يثبّت الاعتماديات ويصدّر نسخة الويب مع قاعدة المسار `/moadbook` ثم ينشرها إلى GitHub Pages.

## التشغيل والبناء محليًا

يتطلب Node.js 22 وpnpm 9.12.0:

```bash
cd moadbook-web
pnpm install --frozen-lockfile
pnpm dev
```

لتصدير نسخة GitHub Pages:

```bash
cd moadbook-web
EXPO_PUBLIC_BASE_URL=/moadbook pnpm exec expo export --platform web --output-dir dist
node scripts/prepare-pages.mjs
```

## Firebase والأمان

إعداد Firebase الموجود في `moadbook-web/app.config.ts` هو إعداد عميل عام مستخدم في تطبيق moadbook. صلاحيات الوصول الفعلية تتحكم بها قواعد Firebase؛ لا تضع مفاتيح إدارة أو أسرارًا أو بيانات مستخدمين في هذا المستودع العام، ولا تجعل القواعد مفتوحة للعامة. اختبارات واجهة الويب لا تكتب في قاعدة الإنتاج.

## التحقق

يحتوي المشروع على فحوص الأنواع والاختبارات الحالية. دعم إشعارات الدفع بالخلفية يتطلب إعداد APNs/مرسل موثوق؛ أما إشعارات التطبيق الداخلية فتظهر داخل واجهة moadbook.
