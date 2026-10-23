# moadbook iOS — مصدر التطبيق

تطبيق iOS أصلي مبني على Expo Router وReact Native وTypeScript، بواجهة عربية RTL وموجّه لأجهزة iPhone. يحافظ على نمط Firebase الموجود في تطبيق moadbook السابق، ويستخدم Firebase Authentication REST وRealtime Database REST مباشرة.

## التشغيل محليًا

يتطلب Node.js وpnpm وExpo. داخل جذر المشروع:

```bash
pnpm install
pnpm check
pnpm dev
```

يفتح `pnpm dev` خادم Metro للمعاينة على المنفذ 8081 وخادم API القالب على 3000. بعد تسجيل بيانات Expo للحساب في Dashboard يمكن فتح QR من Dashboard ثم مسحه في Expo Go على جهاز iPhone مسجّل بالحساب نفسه. بيئة Sandbox أو لقطة Web لا تُعد بديلًا لاختبار المكونات الأصلية على هاتف.

## تكامل Firebase

توجد إعدادات Firebase العامة المستخدمة أصلًا في `app.config.ts` تحت `extra.moadbookFirebase`؛ وهي إعدادات عميل وليست مفتاحًا إداريًا. تحفظ جلسة iOS باستخدام `expo-secure-store`، وتستخدم الواجهة المسارات الحالية مثل `/profiles` و`/posts` و`/postMedia` و`/friendships` و`/conversations` و`/messages` و`/notifications` و`/groups` و`/groupMembers`.

لا تُعدّل قواعد Firebase أو بياناته عند بناء هذا المصدر. ضغط الصورة يعمل على الجهاز قبل تخزين JPEG كـdata URL وفق حدود قواعد المنشور الحالية. إذا رفضت القواعد الكتابة، يعرض التطبيق رسالة خطأ عربية؛ لا يعني ذلك أن الخادم قد تغيّر. اختبر عمليات القراءة والكتابة على حساب أو مشروع Firebase مخصص للاختبار قبل الاستخدام التشغيلي.

## التنبيهات والفيديو

تُعرض إشعارات RTDB داخل التطبيق. الإشعارات الفعلية عندما يكون التطبيق مغلقًا تتطلب إعداد APNs/Expo ومرسلًا خلفيًا موثوقًا وتسجيل token بموافقة المستخدم؛ لذلك لا يُعلن هذا المصدر أن Push الخلفي مُفعّل. تُشغّل الروابط المباشرة المتوافقة عبر Expo Video. خدمات الفيديو الخارجية قد تمنع التضمين، وعندها يوفّر التطبيق فتح الرابط في المنصة.

## TestFlight وApp Store

يحافظ `app.config.ts` على `appSlug` وscheme ومعرّف Bundle ID المولّد للمشروع. لا تضع شهادات Apple أو مفاتيح خاصة في المصدر. يتطلب إنشاء TestFlight/App Store حساب Apple Developer نشطًا، اعتماد Bundle ID، إعداد توقيع iOS، ثم تشغيل بناء iOS الرسمي من Dashboard بعد اعتماد المشروع. وجود كود Expo وحده لا ينشئ IPA موقعًا ولا ينشر التطبيق.
