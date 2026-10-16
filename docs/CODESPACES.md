# UZGO ni GitHub Codespaces'da sinash (kompyutersiz, bepul)

Codespaces — GitHub'dagi virtual kompyuter. U yerda baza, API va sayt
ishga tushadi, siz esa saytni telefon yoki iPad brauzerida ochasiz.
Bu **faqat sinov uchun**: demo ma'lumotlar, test SMS, test to'lov. Haqiqiy
mijozlar uchun emas.

## 1. Ishga tushirish (birinchi marta, ~10 daqiqa)

1. GitHub'da `uzgo.uz` repozitoriyasini oching.
2. Yashil **Code** tugmasi → **Codespaces** yorlig'i → **Create codespace on main**.
3. Kuting. Pastdagi terminalda `[uzgo] 1/6 … 6/6` va oxirida
   `[uzgo] ready: API and web are running` chiqadi.
4. Sayt avtomatik ochiladi. Ochilmasa: pastdagi **PORTS** yorlig'i →
   **UZGO sayt (3000)** qatoridagi 🌐 belgisini bosing.

Havola shunday ko'rinadi: `https://<nom>-3000.app.github.dev/uz`.
U **shaxsiy** — faqat sizning GitHub akkauntingiz bilan ochiladi.

## 2. Saytga kirish (SMS kodi)

SMS haqiqatda yuborilmaydi. Kod terminalga yoziladi:

1. Saytda **Kabinet** → telefon raqam → **Kodni olish**.
2. Codespace terminalida yozing: `kod` → 6 xonali kodni ko'rasiz.
3. Kodni saytga kiriting.

## 3. Admin va sotuvchi bo'lib ko'rish

Avval saytga o'sha raqam bilan bir marta kiring, keyin terminalda:

| Buyruq               | Nima qiladi                                        |
| -------------------- | -------------------------------------------------- |
| `admin 901234567`    | Bu raqamni super admin qiladi → `/uz/admin`        |
| `sotuvchi 901234567` | Bu raqamni demo do'kon egasi qiladi → `/uz/seller` |
| `kod`                | Oxirgi SMS kodlarni ko'rsatadi                     |
| `qayta`              | Sayt va API ni qayta ishga tushiradi               |
| `yangila`            | GitHub'dagi eng yangi kodni olib, qayta yig'adi    |

Bu sinov muhitida adminlar uchun ikki bosqichli kod (TOTP) o'chirilgan.
Haqiqiy serverda u doim yoqilgan.

Food (restoranlar) uchun demo restoran yo'q — admin paneldan qo'shing.
Online to'lov "Test to'lov" bilan ishlaydi (haqiqiy pul yechilmaydi).

## 4. Muhim

- Bepul limit: shaxsiy akkauntga oyiga cheklangan soat beriladi.
  Ishingiz tugagach codespace'ni **to'xtating**: github.com/codespaces →
  `…` → **Stop codespace**. Keyin o'sha yerdan **Open** bilan qayta ochasiz,
  sayt o'zi ishga tushadi.
- 30 kun ishlatilmagan codespace o'chiriladi. Kerak bo'lsa yangisini yarating.
- Haqiqiy shaxsiy ma'lumot kiritmang — bu xorijdagi sinov muhiti.

Texnik tafsilotlar: `.devcontainer/` (setup.sh — bir martalik o'rnatish,
start.sh — har ishga tushishda, env.sh — sozlamalar).
