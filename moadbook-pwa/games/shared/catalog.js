export const GAME_DEFS = [
  { id: 'runner', name: 'موآد رانر', title: 'MOAD RUNNER', description: 'اقفز، تفادَ العوائق، واجمع العملات لأبعد مسافة.', icon: '↗', accent: 'mint', featured: true, version: '1.0.0' },
  { id: 'memory', name: 'تحدي الذاكرة', title: 'MEMORY CHALLENGE', description: 'اكشف البطاقات وطابق الأزواج عبر ثلاثة مستويات.', icon: '◇', accent: 'violet', featured: true, version: '1.0.0' },
  { id: 'quiz', name: 'موآد كويز', title: 'MOAD QUIZ', description: 'اختبار سريع في الحساب والمنطق، بإجابات يتحقق منها الخادم.', icon: '؟', accent: 'gold', featured: true, version: '1.0.0' },
  { id: 'block-puzzle', name: 'تركيب القطع', title: 'BLOCK PUZZLE', description: 'ضع القطع وامسح الصفوف والأعمدة على لوحة 10×10.', icon: '▦', accent: 'blue', featured: false, version: '1.0.0' },
  { id: 'snake', name: 'ثعبان مواد', title: 'SNAKE MOAD', description: 'اجمع الطعام، كبر بحذر، وحقق أفضل نتيجة.', icon: '⌁', accent: 'green', featured: false, version: '1.0.0' },
  { id: 'tic-tac-toe', name: 'إكس أو: تحدّي الروبوت', title: 'MOADBOOK XO', description: 'كوّن صفًا من ثلاث خانات وتغلّب على خصم ذكي.', icon: '×', accent: 'violet', featured: true, version: '1.0.0' },
];

export const GAME_IDS = new Set(GAME_DEFS.map(game => game.id));
