تحديث تسجيل الدخول وتتبع موظفي لعبة OPPO EHS

ما الذي تغير؟


دخول الموظف بالرقم الوظيفي وكلمة مرور فردية.

الاسم والإدارة يتم جلبهما من سجل الموظف، ولا يكتبهما الموظف بنفسه.

حفظ جلسات الدخول والتقدم في Supabase حتى تظهر للمشرف من جهاز آخر.

تسجيل دخول المشرف بحساب Supabase المعتمد mo.i.kafrana@gmail.com وكلمة مرور الحساب، وليس برمز ثابت داخل الصفحة.

استيراد ملف Excel من ورقة Employees بعناوين employee_id, full_name, department أو العناوين العربية.

إنشاء كلمات مرور مؤقتة للحسابات الجديدة فقط وتنزيلها في ملف CSV. إعادة الاستيراد تحدث بيانات الاسم/القسم ولا تعيد تعيين كلمة المرور. يتم فحص ehs_profiles وحسابات Auth الحالية لإعادة استخدام حساب الموظف الموجود وعدم إنشاء حساب مكرر، مع حماية حسابات المشرفين.


إعداد مطلوب قبل التشغيل


افتح Supabase SQL Editor وشغّل الملف supabase/migrations/202611180001_ehs_game_employee_auth.sql مرة واحدة.

في index.html رابط مشروع Supabase الخاص بك مضبوط مسبقاً. أضف قيمة YOUR_SUPABASE_ANON_KEY بمفتاح anon/public فقط.

انشر Edge Function: supabase functions deploy import-employees

تأكد من أن أسرار Supabase القياسية مضبوطة في المشروع: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY. مفتاح service_role يبقى على الخادم ولا يوضع في HTML.

تأكد أن حساب المشرف mo.i.kafrana@gmail.com موجود في Auth، وأنه الحساب المخصص لإدارة الاستيراد.

انشر index.html على الاستضافة بعد الإعداد.


شكل ملف Excel

ورقة باسم Employees (أو أول ورقة) وبها أعمدة:



employee_id / الرقم الوظيفي

full_name / اسم الموظف

department / القسم


لا تضف كلمات مرور إلى ملف Excel. لا ترسل ملف كلمات المرور الناتج في مجموعة عامة؛ وزّع كلمة مرور كل موظف عليه بشكل خاص.


تنبيه مهم

النسخة المعدلة تعتمد على Supabase للهوية والسجلات المشتركة. ملف HTML وحده لن يحقق تتبعاً بين أجهزة مختلفة قبل تنفيذ SQL ونشر Edge Function وإضافة رابط المشروع ومفتاح anon. لا تضع service_role في المتصفح مطلقاً.




## GLB asset optimization

Install the project dependencies, then optimize a **static factory environment** asset:

```bash
npm install
npm run optimize:glb -- public/models/factory.glb public/models/factory.optimized.glb environment
```

For the **rigged EHS inspector**, use the conservative character profile:

```bash
npm run optimize:glb -- public/models/ehs-inspector.glb public/models/ehs-inspector.optimized.glb character
```

Important safeguards:

- Always write to a new output file; the source GLB is never overwritten.
- `environment` mode refuses files containing skins or animations. It applies static-scene instancing, mesh joining, welding, controlled simplification (50% target ratio), pruning, sparse accessors and WebP texture resizing to 1024 px.
- `character` mode avoids hierarchy-changing and geometry simplification steps to protect the skeleton, skinning and animation clips. It only deduplicates, prunes unused data, sparsifies eligible accessors and compresses/resizes textures.
- Review the optimized GLB in a viewer and test all animation clips, mobile loading, visual quality and interaction before replacing any production asset.
- This utility does not upload assets or modify employee accounts, Supabase data, competition scores or game sessions.
