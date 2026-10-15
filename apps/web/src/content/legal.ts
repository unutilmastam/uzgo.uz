import type { Locale } from '@/i18n/routing';

/**
 * Legal texts (Phase 7). DRAFTS: they describe how UZGO actually works today,
 * but must be reviewed by a lawyer licensed in Uzbekistan before launch, and
 * the operator's details below must be filled in (docs/RUNBOOK.md, go-live).
 */
export type LegalDoc = {
  updated: string;
  sections: { heading: string; paragraphs: string[] }[];
};

/** Operator details: placeholders until the company is registered. */
const OPERATOR = {
  uz: '[Operator kompaniyasining toʻliq nomi, STIR, manzili]',
  ru: '[Полное наименование компании-оператора, ИНН, адрес]',
  email: '[support@domen]',
};

const UPDATED = '2026-10-15';

const terms: Record<Locale, LegalDoc> = {
  uz: {
    updated: UPDATED,
    sections: [
      {
        heading: '1. Umumiy qoidalar',
        paragraphs: [
          `Ushbu hujjat ${OPERATOR.uz} (keyingi oʻrinlarda — «UZGO») tomonidan UZGO onlayn bozori (sayt va ilovalar) orqali xizmat koʻrsatish shartlarini belgilaydi va Oʻzbekiston Respublikasi Fuqarolik kodeksiga muvofiq ommaviy oferta hisoblanadi.`,
          'Saytdan roʻyxatdan oʻtish, buyurtma berish yoki doʻkon ochish ushbu shartlarni toʻliq qabul qilish (aksept) hisoblanadi. Shartlarga rozi boʻlmasangiz, xizmatdan foydalanmang.',
        ],
      },
      {
        heading: '2. UZGOning roli',
        paragraphs: [
          'UZGO — koʻp sotuvchili bozor (marketpleys). Tovarlarni mustaqil sotuvchilar (yuridik shaxslar va yakka tartibdagi tadbirkorlar) sotadi. Oldi-sotdi shartnomasi xaridor va tegishli sotuvchi oʻrtasida tuziladi; tovar sifati, toʻliqligi va tavsifining toʻgʻriligi uchun sotuvchi javob beradi.',
          'Har bir doʻkon va mahsulot sotuvga chiqishidan oldin UZGO moderatsiyasidan oʻtadi. UZGO qoidalarni buzgan doʻkon yoki mahsulotni toʻxtatib qoʻyishi mumkin.',
          'Mahsulot sahifasida sotuvchi doʻkonining nomi koʻrsatiladi. Bir nechta doʻkondan olingan buyurtma doʻkonlar boʻyicha alohida joʻnatmalarga boʻlinadi.',
        ],
      },
      {
        heading: '3. Hisob va kirish',
        paragraphs: [
          'Kirish telefon raqamiga SMS orqali yuboriladigan bir martalik kod bilan amalga oshiriladi. Hisobingizdagi harakatlar uchun siz javobgarsiz; kodni hech kimga bermang — UZGO xodimlari uni hech qachon soʻramaydi.',
        ],
      },
      {
        heading: '4. Narx va buyurtma',
        paragraphs: [
          'Narxlar oʻzbek soʻmida koʻrsatiladi. Yakuniy summa (tovarlar va yetkazib berish) buyurtma tasdiqlanishidan oldin koʻrsatiladi va server tomonidan hisoblanadi; narx oʻzgargan boʻlsa, sizga yangi summa koʻrsatiladi.',
          'Buyurtma tovar qoldigʻi yetarli boʻlganda qabul qilinadi. Sotuvchi buyurtmani qabul qilish yoki asosli sabab bilan bekor qilish huquqiga ega; bunday holatda toʻlangan mablagʻ qaytariladi.',
        ],
      },
      {
        heading: '5. Toʻlov',
        paragraphs: [
          'Toʻlov usullari: yetkazib berishda naqd yoki karta orqali, shuningdek onlayn — Payme va Click orqali (ular yoqilgan boʻlsa). Onlayn toʻlovni UZGO sotuvchilar nomidan qabul qiladi va komissiyasini ushlab qolgan holda sotuvchiga oʻtkazadi.',
          'Onlayn toʻlanmagan buyurtma belgilangan muddatdan soʻng avtomatik bekor qilinadi va tovar zaxiradan chiqariladi. Karta maʼlumotlari UZGOda saqlanmaydi — ular toʻlov tizimi tomonida kiritiladi.',
          'Onlayn toʻlovlar uchun fiskal chek qonunchilikka muvofiq rasmiylashtiriladi.',
        ],
      },
      {
        heading: '6. Yetkazib berish',
        paragraphs: [
          'Yetkazib berish narxi va muddati tuman hamda doʻkonga bogʻliq va buyurtma berishdan oldin koʻrsatiladi. Topshirish punktidan olib ketish bepul. Joʻnatma holati va kuzatuv kodi buyurtma sahifasida koʻrinadi.',
        ],
      },
      {
        heading: '7. Bekor qilish va qaytarish',
        paragraphs: [
          'Sotuvchi qabul qilmagan buyurtmani bekor qilishingiz mumkin. Yetkazilgan tovarni qaytarish va almashtirish isteʼmolchilar huquqlarini himoya qilish toʻgʻrisidagi qonunchilikda belgilangan tartib va muddatlarda amalga oshiriladi; soʻrov buyurtma sahifasi orqali yuboriladi.',
          'Qaytarish tasdiqlangach, mablagʻ toʻlov qilingan usul orqali qaytariladi.',
        ],
      },
      {
        heading: '8. Sotuvchilar uchun',
        paragraphs: [
          'Sotuvchi doʻkon ochishda haqiqiy rekvizitlarni (STIR, rasmiy nom) koʻrsatadi, tovar haqida toʻgʻri maʼlumot beradi, buyurtmalarni oʻz vaqtida bajaradi va soliq majburiyatlari uchun mustaqil javob beradi.',
          'UZGO komissiyasi kelishilgan stavkada (buyurtma paytida qayd etiladi) ushlab qolinadi. Sotuvchiga toʻlov yetkazilgan buyurtmalar uchun qaytarish muddati tugagach amalga oshiriladi.',
          'Taqiqlangan, soxta yoki qonunga zid tovarlarni sotish taqiqlanadi.',
        ],
      },
      {
        heading: '9. Javobgarlik va nizolar',
        paragraphs: [
          'Nizolar avvalo muzokara yoʻli bilan hal etiladi: murojaatni qoʻllab-quvvatlash xizmatiga yuboring. Kelishuvga erishilmasa, nizo Oʻzbekiston Respublikasi qonunchiligiga muvofiq sudda koʻriladi.',
          `Murojaatlar uchun: ${OPERATOR.email}.`,
        ],
      },
    ],
  },
  ru: {
    updated: UPDATED,
    sections: [
      {
        heading: '1. Общие положения',
        paragraphs: [
          `Настоящий документ устанавливает условия, на которых ${OPERATOR.ru} (далее — «UZGO») оказывает услуги онлайн-маркетплейса UZGO (сайт и приложения), и является публичной офертой в соответствии с Гражданским кодексом Республики Узбекистан.`,
          'Регистрация, оформление заказа или открытие магазина означают полное принятие (акцепт) этих условий. Если вы не согласны с условиями, не пользуйтесь сервисом.',
        ],
      },
      {
        heading: '2. Роль UZGO',
        paragraphs: [
          'UZGO — маркетплейс с множеством продавцов. Товары продают независимые продавцы (юридические лица и индивидуальные предприниматели). Договор купли-продажи заключается между покупателем и соответствующим продавцом; за качество, комплектность и достоверность описания товара отвечает продавец.',
          'Каждый магазин и товар проходят модерацию UZGO перед публикацией. UZGO может приостановить магазин или товар, нарушающие правила.',
          'На странице товара указан магазин-продавец. Заказ из нескольких магазинов делится на отдельные отправления по магазинам.',
        ],
      },
      {
        heading: '3. Аккаунт и вход',
        paragraphs: [
          'Вход выполняется по одноразовому коду из SMS на номер телефона. Вы отвечаете за действия в своём аккаунте; никому не сообщайте код — сотрудники UZGO никогда его не спрашивают.',
        ],
      },
      {
        heading: '4. Цена и заказ',
        paragraphs: [
          'Цены указаны в узбекских сумах. Итоговая сумма (товары и доставка) показывается до подтверждения заказа и рассчитывается сервером; если цена изменилась, вам будет показана новая сумма.',
          'Заказ принимается при наличии товара. Продавец вправе принять заказ или отменить его по обоснованной причине; в этом случае оплаченные средства возвращаются.',
        ],
      },
      {
        heading: '5. Оплата',
        paragraphs: [
          'Способы оплаты: наличными или картой при получении, а также онлайн через Payme и Click (если включены). Онлайн-оплату UZGO принимает от имени продавцов и перечисляет продавцу за вычетом комиссии.',
          'Неоплаченный онлайн-заказ автоматически отменяется по истечении срока, товар возвращается в продажу. Данные карт не хранятся в UZGO — они вводятся на стороне платёжной системы.',
          'Фискальный чек по онлайн-оплатам оформляется в соответствии с законодательством.',
        ],
      },
      {
        heading: '6. Доставка',
        paragraphs: [
          'Стоимость и срок доставки зависят от района и магазина и показываются до оформления заказа. Самовывоз из пункта выдачи бесплатный. Статус отправления и трек-номер видны на странице заказа.',
        ],
      },
      {
        heading: '7. Отмена и возврат',
        paragraphs: [
          'Вы можете отменить заказ, пока продавец его не принял. Возврат и обмен доставленного товара осуществляются в порядке и сроки, установленные законодательством о защите прав потребителей; запрос отправляется со страницы заказа.',
          'После подтверждения возврата деньги возвращаются тем же способом, которым была произведена оплата.',
        ],
      },
      {
        heading: '8. Для продавцов',
        paragraphs: [
          'Продавец указывает достоверные реквизиты (ИНН, официальное наименование), даёт точную информацию о товаре, своевременно выполняет заказы и самостоятельно отвечает за налоговые обязательства.',
          'Комиссия UZGO удерживается по согласованной ставке (фиксируется в момент заказа). Выплата продавцу за доставленные заказы производится после окончания срока возврата.',
          'Запрещена продажа запрещённых, поддельных или противоречащих закону товаров.',
        ],
      },
      {
        heading: '9. Ответственность и споры',
        paragraphs: [
          'Споры сначала решаются путём переговоров: направьте обращение в службу поддержки. Если согласие не достигнуто, спор рассматривается в суде в соответствии с законодательством Республики Узбекистан.',
          `Для обращений: ${OPERATOR.email}.`,
        ],
      },
    ],
  },
};

const privacy: Record<Locale, LegalDoc> = {
  uz: {
    updated: UPDATED,
    sections: [
      {
        heading: '1. Kim maʼlumotlarni qayta ishlaydi',
        paragraphs: [
          `Shaxsga doir maʼlumotlar operatori — ${OPERATOR.uz}. Maʼlumotlar «Shaxsga doir maʼlumotlar toʻgʻrisida»gi Oʻzbekiston Respublikasi Qonuniga muvofiq qayta ishlanadi.`,
        ],
      },
      {
        heading: '2. Qanday maʼlumotlar yigʻiladi',
        paragraphs: [
          'Hisob: telefon raqami, ism (ixtiyoriy), tanlangan til.',
          'Buyurtmalar: qabul qiluvchining ismi va telefoni, yetkazib berish manzili (viloyat, tuman, koʻcha), buyurtma tarkibi, toʻlov holati.',
          'Sotuvchilar: doʻkonning rasmiy nomi, STIR, aloqa telefoni, doʻkon xodimlari.',
          'Texnik maʼlumotlar: kirish seanslari, qurilma (brauzer) turi, IP-manzil — xavfsizlik va suiisteʼmolning oldini olish uchun; IP-manzillar maxsus kalit bilan xeshlangan holda saqlanadi.',
          'Karta raqamlari UZGOda saqlanmaydi: toʻlov Payme yoki Click sahifasida amalga oshiriladi.',
        ],
      },
      {
        heading: '3. Maqsadlar',
        paragraphs: [
          'Hisobga kirish (SMS kod), buyurtmani rasmiylashtirish va yetkazish, toʻlovni qabul qilish va qaytarish, buyurtma holati haqida xabar berish, firibgarlik va hujumlarning oldini olish, qonunchilik talablarini (soliq, buxgalteriya) bajarish.',
          'Reklama xabarlari faqat alohida roziligingiz bilan yuboriladi (hozircha yuborilmaydi).',
        ],
      },
      {
        heading: '4. Kimga beriladi',
        paragraphs: [
          'Buyurtmangizni bajaradigan sotuvchiga — faqat shu joʻnatma uchun zarur maʼlumotlar (qabul qiluvchi ismi, telefoni, manzil).',
          'Xizmat koʻrsatuvchilarga: SMS yuborish (Eskiz), onlayn toʻlov (Payme, Click), sotuvchilarga Telegram bildirishnomalari (xabarda manzil va ism boʻlmaydi). Ular maʼlumotlardan faqat shu xizmat uchun foydalanadi.',
          'Mobil ilovada bildirishnomalarni yoqsangiz, ular Expo, Google (Android) va Apple (iOS) push xizmatlari orqali yetkaziladi. Bu xizmatlar Oʻzbekistondan tashqarida joylashgan, shuning uchun xabarda faqat buyurtma raqami va holati boʻladi — ism, telefon va manzil yuborilmaydi. Bildirishnomalarni telefon sozlamalarida istalgan vaqtda oʻchirish mumkin.',
          'Davlat organlariga — faqat qonunda belgilangan hollarda.',
        ],
      },
      {
        heading: '5. Saqlash joyi va muddati',
        paragraphs: [
          'Oʻzbekiston fuqarolarining shaxsga doir maʼlumotlari Oʻzbekiston hududidagi serverlarda saqlanadi; zaxira nusxalar ham Oʻzbekistonda, shifrlangan holda saqlanadi.',
          'Buyurtma va toʻlov maʼlumotlari qonunchilikda belgilangan muddat davomida (buxgalteriya va soliq hujjatlari uchun) saqlanadi. Seans maʼlumotlari seans tugagach oʻchiriladi; tasdiqlash kodlari qisqa muddat saqlanadi.',
        ],
      },
      {
        heading: '6. Himoya',
        paragraphs: [
          'Ulanish faqat shifrlangan (HTTPS) kanal orqali; parollar oʻrniga bir martalik kodlar; xodimlar uchun ikki bosqichli tasdiqlash; ruxsatlar rollar boʻyicha cheklangan; muhim harakatlar jurnalga yoziladi; maʼlumotlar bazasi tashqi tarmoqqa ochiq emas.',
        ],
      },
      {
        heading: '7. Cookie va brauzer xotirasi',
        paragraphs: [
          'Faqat zarur cookie fayllar ishlatiladi: kirish seansi, mehmon savati va tanlangan til. Tungi rejim tanlovi brauzer xotirasida saqlanadi. Mobil ilovada kirish kaliti telefonning himoyalangan xotirasida (Keychain / Keystore) saqlanadi. Reklama yoki kuzatuv cookie fayllari ishlatilmaydi.',
        ],
      },
      {
        heading: '8. Huquqlaringiz',
        paragraphs: [
          'Maʼlumotlaringiz haqida maʼlumot olish, ularni tuzatish, qayta ishlashga roziligingizni qaytarib olish va hisobingizni oʻchirishni soʻrash huquqiga egasiz (qonun boʻyicha saqlanishi shart boʻlgan buyurtma hujjatlari bundan mustasno). Ismni profil sahifasida oʻzgartirishingiz mumkin.',
          `Soʻrovlar uchun: ${OPERATOR.email}. Biz qonunda belgilangan muddatda javob beramiz.`,
        ],
      },
      {
        heading: '9. Oʻzgarishlar',
        paragraphs: [
          'Siyosat oʻzgarsa, yangi tahriri shu sahifada eʼlon qilinadi va yangilangan sana koʻrsatiladi.',
        ],
      },
    ],
  },
  ru: {
    updated: UPDATED,
    sections: [
      {
        heading: '1. Кто обрабатывает данные',
        paragraphs: [
          `Оператор персональных данных — ${OPERATOR.ru}. Данные обрабатываются в соответствии с Законом Республики Узбекистан «О персональных данных».`,
        ],
      },
      {
        heading: '2. Какие данные собираются',
        paragraphs: [
          'Аккаунт: номер телефона, имя (необязательно), выбранный язык.',
          'Заказы: имя и телефон получателя, адрес доставки (область, район, улица), состав заказа, статус оплаты.',
          'Продавцы: официальное наименование магазина, ИНН, контактный телефон, сотрудники магазина.',
          'Технические данные: сеансы входа, тип устройства (браузера), IP-адрес — для безопасности и предотвращения злоупотреблений; IP-адреса хранятся в виде хеша с секретным ключом.',
          'Номера карт в UZGO не хранятся: оплата проходит на странице Payme или Click.',
        ],
      },
      {
        heading: '3. Цели',
        paragraphs: [
          'Вход в аккаунт (SMS-код), оформление и доставка заказа, приём и возврат оплаты, уведомления о статусе заказа, предотвращение мошенничества и атак, выполнение требований законодательства (налоги, бухгалтерия).',
          'Рекламные сообщения отправляются только с вашего отдельного согласия (сейчас не отправляются).',
        ],
      },
      {
        heading: '4. Кому передаются',
        paragraphs: [
          'Продавцу, выполняющему ваш заказ, — только данные, необходимые для этого отправления (имя и телефон получателя, адрес).',
          'Поставщикам услуг: отправка SMS (Eskiz), онлайн-оплата (Payme, Click), уведомления продавцам в Telegram (без адреса и имени). Они используют данные только для этой услуги.',
          'Если вы включите уведомления в мобильном приложении, они доставляются через push-сервисы Expo, Google (Android) и Apple (iOS). Эти сервисы находятся за пределами Узбекистана, поэтому в сообщении есть только номер и статус заказа — имя, телефон и адрес не передаются. Уведомления можно отключить в настройках телефона в любой момент.',
          'Государственным органам — только в случаях, предусмотренных законом.',
        ],
      },
      {
        heading: '5. Место и срок хранения',
        paragraphs: [
          'Персональные данные граждан Узбекистана хранятся на серверах на территории Узбекистана; резервные копии также хранятся в Узбекистане в зашифрованном виде.',
          'Данные заказов и оплат хранятся в течение срока, установленного законодательством (для бухгалтерских и налоговых документов). Данные сеанса удаляются после его завершения; коды подтверждения хранятся недолго.',
        ],
      },
      {
        heading: '6. Защита',
        paragraphs: [
          'Соединение только по зашифрованному каналу (HTTPS); одноразовые коды вместо паролей; двухфакторная проверка для сотрудников; доступ ограничен ролями; важные действия записываются в журнал; база данных недоступна из внешней сети.',
        ],
      },
      {
        heading: '7. Cookie и хранилище браузера',
        paragraphs: [
          'Используются только необходимые cookie: сеанс входа, гостевая корзина и выбранный язык. Выбор тёмной темы хранится в браузере. В мобильном приложении ключ входа хранится в защищённом хранилище телефона (Keychain / Keystore). Рекламные и отслеживающие cookie не используются.',
        ],
      },
      {
        heading: '8. Ваши права',
        paragraphs: [
          'Вы вправе получить сведения о своих данных, исправить их, отозвать согласие на обработку и запросить удаление аккаунта (кроме документов по заказам, которые закон обязывает хранить). Имя можно изменить на странице профиля.',
          `Для запросов: ${OPERATOR.email}. Мы ответим в срок, установленный законом.`,
        ],
      },
      {
        heading: '9. Изменения',
        paragraphs: [
          'При изменении политики новая редакция публикуется на этой странице с указанием даты обновления.',
        ],
      },
    ],
  },
};

export const LEGAL_PAGES = { terms, privacy } as const;

export function legalDoc(slug: string, locale: Locale): LegalDoc | null {
  return slug === 'terms' || slug === 'privacy' ? LEGAL_PAGES[slug][locale] : null;
}
