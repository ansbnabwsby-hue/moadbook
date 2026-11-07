# عقد وحدات ألعاب Moadbook

كل لعبة مستقلة داخل `games/<slug>/game.js` وتُحمّل كـ ES module من صفحة اللعب المشتركة. لا تستورد ملفات CSS من JavaScript؛ تربط صفحة اللعب ملف CSS الخاص بكل لعبة مباشرة.

```js
const instance = mountGame(rootElement, {
  onStart: async (gameId, options) => sessionOrNull,
  onCancel: async (session) => void,
  onAnswer: async (session, { questionId, choiceIndex, elapsedMs }) => ({ correct, explanation }),
  onFinish: async (session, { score, durationMs, metrics }) => receipt,
  onStatus: (message, kind) => void,
  onProgress: (metrics) => void,
});
```

- تنتظر اللعبة `onStart` قبل بدء المؤقت أو قبول الإدخال؛ إذا تعذر الاتصال يبدأ طور محلي غير موثق، ولا يُقبل منه رصيد رسمي.
- لكل بداية رمز جيل يحول دون أن تُكمل استجابة متأخرة جولة أُعيد تشغيلها أو أُغلقت.
- تمرر `onCancel` أي جلسة ما زالت نشطة عند إعادة التشغيل أو الخروج. يكون إلغاء الخادم idempotent وتنتهي الجلسات المهجورة تلقائيًا.
- في الكويز، لا تصل الإجابة الصحيحة إلى العميل. ترسل اللعبة الاختيار ومدة الإجابة عبر `onAnswer`، وتعرض نتيجة التحقق التي يعيدها الخادم فقط.
- ترسل `onProgress` أرقامًا لعرضها في واجهة اللعب/التحديات، لكنها بيانات عرض لا تمنح نقاطًا ولا تُعد إثباتًا للنتيجة.
- تستخدم `onFinish` مرة واحدة لكل جولة. النتيجة الرسمية تُعاد من الخادم؛ المقاييس القادمة من العميل للتدقيق المساعد فقط.
- يوفر كل كائن لعبة `pause()`, `resume()`, `restart()`, `destroy()`، ويزيل المؤقتات ومستمعي الأحداث عند `destroy()`.
- لا تحفظ اللعبة بيانات أو نقاطًا مباشرةً في Supabase؛ كل طلب يمر من `games/shared/api.js` ثم Edge Function التي تتحقق من Firebase ID token، ثم RPCs بصلاحية الخدمة.
