# Arxitektura tekshiruvi — topilgan xatolar va tuzatishlar

Asl brief yaxshi yozilgan, lekin quyidagi kamchiliklar bor edi. Hammasi
`docs/SPEC.md` da tuzatildi.

## A. Jiddiy (loyihani to'xtatib qo'yishi mumkin)

| #   | Muammo                                                                                                                                 | Tuzatish                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Hosting.** cPanel shared hosting'da NestJS + PostgreSQL + fon jarayonlari ishlamaydi. Briefda bu umuman yo'q edi.                    | §14: VPS yoki boshqaruvli hosting kerak. Qaror Phase 7 gacha qabul qilinadi, kod har qanday hostingga mos (Docker, env). |
| 2   | **Shaxsiy ma'lumotlar qonuni.** O'zbekiston fuqarolarining shaxsiy ma'lumotlari O'zbekistondagi serverlarda saqlanishi talab qilinadi. | §14: xavf sifatida yozildi, ishga tushirishdan oldin yurist bilan tekshirish.                                            |
| 3   | **Kompyuter yo'q.** Brief Docker Compose va lokal tekshiruvga tayangan. Telefondan bu ishlamaydi.                                      | CLAUDE.md: GitHub Actions CI — asosiy tekshiruv manbai. Docker bo'lmasa — aniq hisobot.                                  |
| 4   | **Ko'p sotuvchili buyurtma yo'q edi.** Bitta savatda 3 ta do'kon tovari bo'lsa nima bo'lishi aniqlanmagan.                             | `Order` + har do'kon uchun `SellerOrder`.                                                                                |
| 5   | **Mahsulot variantlari yo'q.** O'lcham/rang/hajm uchun SKU yo'q edi, zaxira mahsulotga bog'langan edi.                                 | `ProductVariant` — narx va zaxira variantda.                                                                             |
| 6   | **Fiskal (soliq) ma'lumotlari yo'q.** To'lov qabul qilishda chek uchun MXIK (IKPU) kodi, qadoq kodi, QQS kerak bo'ladi.                | Variantda ixtiyoriy maydonlar (Phase 4), Phase 6 da majburiy.                                                            |
| 7   | **Sotuvchiga pul to'lash yo'q.** Komissiya, balans, payout jadvali yo'q edi.                                                           | `LedgerEntry`, `Payout`, komissiya stavkasi.                                                                             |

## B. Ziddiyatlar

| #   | Muammo                                                                          | Tuzatish                                                               |
| --- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 8   | Prisma Phase 1 da ham, Phase 3 da ham sozlanadi deb yozilgan.                   | Phase 1: faqat ulanish + health check. Modellar Phase 3 dan.           |
| 9   | "Bo'sh fayl yaratma" deyilgan, lekin strukturada 6 ta package va `apps/mobile`. | Papkalar faqat kerak bo'lgan fazada yaratiladi.                        |
| 10  | `prisma/` ildizda, lekin uni faqat API ishlatadi.                               | `apps/api/prisma` — yagona joy.                                        |
| 11  | `shared-types` + `validation` — bir xil narsa ikki joyda.                       | Bitta `packages/contracts` (Zod). Web va API bir sxemadan foydalanadi. |
| 12  | Phase 2 da bosh sahifada "mahsulot kartalari" bor, lekin baza Phase 3–4 da.     | Phase 2 da aniq belgilangan fixture ma'lumot.                          |

## C. Aniqlanmagan qarorlar (endi aniqlandi)

| #   | Savol                         | Qaror                                                                    |
| --- | ----------------------------- | ------------------------------------------------------------------------ |
| 13  | Kirish usuli?                 | Telefon + SMS kod (OTP). SMS — adapter orqali.                           |
| 14  | JWT yoki sessiya?             | Bazadagi sessiya + HttpOnly cookie.                                      |
| 15  | Pul qanday saqlanadi?         | `BigInt` tiyin (1 so'm = 100 tiyin).                                     |
| 16  | Web va API qanday bog'lanadi? | Bitta domen ostida `/api/v1` — cookie va CORS muammosiz.                 |
| 17  | Rasmlar qayerda?              | S3-mos saqlash, adapter orqali.                                          |
| 18  | Admin panel alohida ilovami?  | `apps/web` ichida `/admin`, `/seller` bo'limlari, server tomonda himoya. |
| 19  | Test vositalari?              | Vitest, Supertest + haqiqiy PostgreSQL, Playwright.                      |
| 20  | MVP da to'lov?                | Avval naqd/yetkazishda to'lov. Onlayn to'lov — Phase 6.                  |

## D. O'zbekistonga xos kamchiliklar

- O'zbek apostrofi (`oʻ`, `gʻ`) va uning variantlari qidiruvda normallashtiriladi.
- Lotin ↔ kirill qidiruv (Phase 4).
- Tovar nomlari ko'p tilli bo'lishi kerak (faqat interfeys emas).
- Viloyat → tuman ma'lumotnomasi, yetkazish hududi tuman bo'yicha.
- Topshirish punktlari (PVZ) — Phase 6.
- Mahsulot moderatsiyasi (`DRAFT → PENDING_REVIEW → APPROVED`).

## E. Kichik tuzatishlar

- Node versiyasi `.nvmrc` bilan qotiriladi.
- Turborepo — monorepoda tez build uchun.
- Buyurtma raqami odam o'qiy oladigan (`UZ-2026-000123`).
- Buyurtma, to'lov, audit yozuvlari hech qachon o'chirilmaydi.
- Loglarda telefon raqami, OTP, token yashiriladi.
- Admin uchun ikki bosqichli tasdiqlash (TOTP).
- Ishga tushirishdan oldin oferta va maxfiylik siyosati sahifalari.
- Versiyalar xotiradan emas, joriy barqaror versiyalar tekshirib olinadi.
