INSERT INTO moadbook_games.question_bank
  (question_id,category_id,category,difficulty,prompt,options,correct_index,explanation,source_title,source_url,source_evidence,enabled)
SELECT q.id, q."categoryId", q.category, q.difficulty, q.prompt,
       ARRAY(SELECT jsonb_array_elements_text(q.options)), q."correctIndex", q.explanation,
       COALESCE(NULLIF(q."sourceTitle",''),'تحقق حسابي مباشر'), q."sourceUrl", COALESCE(NULLIF(q."sourceEvidence",''),q."verificationMethod",'مراجعة حسابية داخلية'), true
FROM jsonb_to_recordset($moadbook_questions$[
{"id":"math-02","categoryId":"math","category":"رياضيات ومنطق","difficulty":"easy","prompt":"أكمل النمط: 2، 4، 6، ؟","options":["7","8","9","10"],"correctIndex":1,"explanation":"يزيد كل عدد بمقدار 2؛ لذلك يأتي العدد 8.","verificationMethod":"قاعدة نمط حسابية ثابتة: زيادة 2 في كل خطوة."},
{"id":"math-03","categoryId":"math","category":"رياضيات ومنطق","difficulty":"medium","prompt":"كم يساوي 6 × 4؟","options":["20","22","24","26"],"correctIndex":2,"explanation":"6 مجموعات من 4 تساوي 24.","verificationMethod":"الضرب المباشر: 6 × 4 = 24."},
{"id":"math-04","categoryId":"math","category":"رياضيات ومنطق","difficulty":"medium","prompt":"إذا كان اليوم الثلاثاء، فما اليوم بعد يومين؟","options":["الأربعاء","الخميس","الجمعة","السبت"],"correctIndex":1,"explanation":"بعد الأربعاء يأتي الخميس، وهو بعد يومين من الثلاثاء.","verificationMethod":"عدّ يومين في ترتيب أيام الأسبوع."},
{"id":"math-05","categoryId":"math","category":"رياضيات ومنطق","difficulty":"hard","prompt":"ما العدد الذي إذا ضُرب في 3 ثم أضيف إليه 2 أصبح 20؟","options":["5","6","7","8"],"correctIndex":2,"explanation":"إذا كان العدد 6 فـ3 × 6 + 2 = 20.","verificationMethod":"حل المعادلة 3x + 2 = 20 ينتج x = 6."},
{"id":"math-06","categoryId":"math","category":"رياضيات ومنطق","difficulty":"hard","prompt":"لدى سارة 3 صناديق، في كل صندوق 4 كرات. أخرجت كرة من كل صندوق؛ كم بقي؟","options":["7","8","9","10"],"correctIndex":2,"explanation":"كان لديها 12 كرة، وأخرجت 3، فبقيت 9.","verificationMethod":"الحساب المباشر: 3 × 4 − 3 = 9."}
]$moadbook_questions$::jsonb) AS q(
  id text, "categoryId" text, category text, difficulty text, prompt text, options jsonb,
  "correctIndex" smallint, explanation text, "sourceTitle" text, "sourceUrl" text, "sourceEvidence" text, "verificationMethod" text
)
ON CONFLICT (question_id) DO NOTHING;
