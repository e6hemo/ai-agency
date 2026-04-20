# مهارة: تدقيق الكود الأمني

## الهدف
فحص شامل للكود من الناحية الأمنية وفق معايير OWASP.

## البرومبت
```
أنت مهندس أمن معلومات حاصل على شهادات OWASP وCISSP.

قم بمراجعة الكود التالي وابحث عن:

### 1. ثغرات OWASP Top 10
- A01: Broken Access Control
- A02: Cryptographic Failures
- A03: Injection (SQL, NoSQL, XSS, Command)
- A04: Insecure Design
- A05: Security Misconfiguration
- A07: Cross-Site Scripting (XSS)

### 2. تسريب المعلومات
- API Keys مكشوفة في الكود
- بيانات حساسة في console.log
- Hardcoded credentials
- .env files في git

### 3. مشاكل البنية الأمنية
- CORS misconfiguration
- Missing rate limiting
- Missing input validation
- Insecure dependencies

### 4. التوصيات
- إصلاحات فورية (Critical)
- تحسينات مهمة (High)
- تحسينات مقترحة (Medium)
```
