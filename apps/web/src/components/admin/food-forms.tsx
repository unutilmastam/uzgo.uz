'use client';

import type { AdminRestaurant, Region } from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { Input } from '@uzgo/ui/components/input';
import { toast } from '@uzgo/ui/components/toast';
import { parseSomInput, somInputValue } from '@uzgo/ui/lib/money';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { DistrictPicker } from '@/components/geo/district-picker';
import { Field, FormError, NativeSelect } from '@/components/panel/form-controls';
import { useErrorMessage } from '@/components/panel/use-error-message';
import { useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { apiClient } from '@/lib/api-client';

/** Same hours every day (most restaurants); finer schedules via the API. */
const everyDay = (open: string, close: string) =>
  [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open, close }));

function useAction() {
  const t = useTranslations('admin');
  const errorMessage = useErrorMessage('admin');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>, after?: () => void) => {
    setPending(true);
    setError(null);
    try {
      await action();
      toast.success(t('done'));
      after?.();
      router.refresh();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setPending(false);
    }
  };
  return { pending, error, setError, run };
}

/** Staff add a restaurant for an existing UZGO account (ADR 0024). */
export function RestaurantCreateForm({ regions }: { regions: Region[] }) {
  const t = useTranslations('admin');
  const id = useId();
  const router = useRouter();
  const { pending, error, setError, run } = useAction();
  const [place, setPlace] = useState({ regionId: '', districtId: '' });
  const [f, setF] = useState({
    nameUz: '',
    nameRu: '',
    slug: '',
    ownerPhone: '',
    address: '',
    lat: '',
    lng: '',
    phone: '',
    mode: 'UZGO' as 'SELF' | 'UZGO',
    radiusKm: '5',
    fee: '0',
    min: '0',
    prep: '25',
    open: '09:00',
    close: '23:00',
    commission: '',
  });
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) => {
    setF((v) => ({ ...v, [key]: e.target.value }));
  };

  async function submit() {
    const lat = Number(f.lat.replace(',', '.'));
    const lng = Number(f.lng.replace(',', '.'));
    const fee = parseSomInput(f.fee || '0');
    const min = parseSomInput(f.min || '0');
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !fee || !min || !place.districtId) {
      setError(t('foodCheckFields'));
      return;
    }
    let createdId = '';
    await run(
      async () => {
        const res = await apiClient<{ restaurant: { id: string } }>('/admin/restaurants', {
          method: 'POST',
          body: {
            name: { uz: f.nameUz.trim(), ru: f.nameRu.trim() },
            slug: f.slug.trim(),
            ownerPhone: f.ownerPhone,
            districtId: place.districtId,
            address: f.address.trim(),
            lat,
            lng,
            ...(f.phone.trim() ? { phone: f.phone } : {}),
            deliveryMode: f.mode,
            deliveryRadiusM: Math.round(Number(f.radiusKm.replace(',', '.')) * 1000),
            selfDeliveryFeeTiyin: fee,
            minOrderTiyin: min,
            prepMinutes: Number(f.prep),
            openingHours: everyDay(f.open, f.close),
            ...(f.commission.trim()
              ? { commissionBp: Math.round(Number(f.commission.replace(',', '.')) * 100) }
              : {}),
          },
        });
        createdId = res.restaurant.id;
      },
      () => {
        router.push(`/admin/restaurants/${createdId}`);
      },
    );
  }

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      data-testid="restaurant-form"
    >
      <Field id={`${id}-nuz`} label={t('foodNameUz')}>
        <Input id={`${id}-nuz`} value={f.nameUz} onChange={set('nameUz')} maxLength={80} />
      </Field>
      <Field id={`${id}-nru`} label={t('foodNameRu')}>
        <Input id={`${id}-nru`} value={f.nameRu} onChange={set('nameRu')} maxLength={80} />
      </Field>
      <Field id={`${id}-slug`} label={t('foodSlug')} hint={t('foodSlugHint')}>
        <Input id={`${id}-slug`} value={f.slug} onChange={set('slug')} maxLength={60} />
      </Field>
      <Field id={`${id}-owner`} label={t('foodOwnerPhone')} hint={t('foodOwnerHint')}>
        <Input id={`${id}-owner`} type="tel" value={f.ownerPhone} onChange={set('ownerPhone')} />
      </Field>
      <div className="sm:col-span-2">
        <DistrictPicker
          regions={regions}
          regionId={place.regionId}
          districtId={place.districtId}
          onChange={setPlace}
        />
      </div>
      <Field id={`${id}-addr`} label={t('foodAddress')} className="sm:col-span-2">
        <Input id={`${id}-addr`} value={f.address} onChange={set('address')} maxLength={200} />
      </Field>
      <Field id={`${id}-lat`} label={t('foodLat')} hint={t('foodCoordsHint')}>
        <Input id={`${id}-lat`} inputMode="decimal" value={f.lat} onChange={set('lat')} />
      </Field>
      <Field id={`${id}-lng`} label={t('foodLng')}>
        <Input id={`${id}-lng`} inputMode="decimal" value={f.lng} onChange={set('lng')} />
      </Field>
      <Field id={`${id}-phone`} label={t('foodPhone')}>
        <Input id={`${id}-phone`} type="tel" value={f.phone} onChange={set('phone')} />
      </Field>
      <Field id={`${id}-mode`} label={t('foodMode')}>
        <NativeSelect id={`${id}-mode`} value={f.mode} onChange={set('mode')}>
          <option value="UZGO">{t('foodMode_UZGO')}</option>
          <option value="SELF">{t('foodMode_SELF')}</option>
        </NativeSelect>
      </Field>
      <Field id={`${id}-radius`} label={t('foodRadius')}>
        <Input
          id={`${id}-radius`}
          inputMode="decimal"
          value={f.radiusKm}
          onChange={set('radiusKm')}
        />
      </Field>
      {f.mode === 'SELF' ? (
        <Field id={`${id}-fee`} label={t('foodSelfFee')}>
          <Input id={`${id}-fee`} inputMode="decimal" value={f.fee} onChange={set('fee')} />
        </Field>
      ) : null}
      <Field id={`${id}-min`} label={t('foodMinOrder')}>
        <Input id={`${id}-min`} inputMode="decimal" value={f.min} onChange={set('min')} />
      </Field>
      <Field id={`${id}-prep`} label={t('foodPrep')}>
        <Input id={`${id}-prep`} inputMode="numeric" value={f.prep} onChange={set('prep')} />
      </Field>
      <Field id={`${id}-open`} label={t('foodOpens')}>
        <Input id={`${id}-open`} type="time" value={f.open} onChange={set('open')} />
      </Field>
      <Field id={`${id}-close`} label={t('foodCloses')} hint={t('foodHoursHint')}>
        <Input id={`${id}-close`} type="time" value={f.close} onChange={set('close')} />
      </Field>
      <Field id={`${id}-comm`} label={t('foodCommission')}>
        <Input
          id={`${id}-comm`}
          inputMode="decimal"
          value={f.commission}
          onChange={set('commission')}
        />
      </Field>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormError id={`${id}-error`} message={error} />
        <Button type="submit" className="self-start" disabled={pending}>
          {t('foodCreate')}
        </Button>
      </div>
    </form>
  );
}

/** Status, intake and delivery settings of one restaurant. */
export function RestaurantSettings({ restaurant }: { restaurant: AdminRestaurant }) {
  const t = useTranslations('admin');
  const id = useId();
  const { pending, error, run } = useAction();
  const [f, setF] = useState({
    mode: restaurant.deliveryMode,
    radiusKm: String(restaurant.deliveryRadiusM / 1000),
    fee: somInputValue(restaurant.selfDeliveryFeeTiyin),
    min: somInputValue(restaurant.minOrderTiyin),
    prep: String(restaurant.prepMinutes),
  });
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) => {
    setF((v) => ({ ...v, [key]: e.target.value }));
  };
  const patch = (body: object) =>
    run(() => apiClient(`/admin/restaurants/${restaurant.id}`, { method: 'PATCH', body }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={restaurant.status === 'ACTIVE' ? 'outline' : 'primary'}
          disabled={pending}
          onClick={() =>
            void patch({ status: restaurant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })
          }
        >
          {restaurant.status === 'ACTIVE' ? t('foodSuspend') : t('foodActivate')}
        </Button>
      </div>
      <form
        className="grid gap-3 sm:grid-cols-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const fee = parseSomInput(f.fee || '0');
          const min = parseSomInput(f.min || '0');
          if (!fee || !min) return;
          void patch({
            deliveryMode: f.mode,
            deliveryRadiusM: Math.round(Number(f.radiusKm.replace(',', '.')) * 1000),
            selfDeliveryFeeTiyin: fee,
            minOrderTiyin: min,
            prepMinutes: Number(f.prep),
          });
        }}
      >
        <Field id={`${id}-mode`} label={t('foodMode')}>
          <NativeSelect id={`${id}-mode`} value={f.mode} onChange={set('mode')}>
            <option value="UZGO">{t('foodMode_UZGO')}</option>
            <option value="SELF">{t('foodMode_SELF')}</option>
          </NativeSelect>
        </Field>
        <Field id={`${id}-radius`} label={t('foodRadius')}>
          <Input
            id={`${id}-radius`}
            inputMode="decimal"
            value={f.radiusKm}
            onChange={set('radiusKm')}
          />
        </Field>
        <Field id={`${id}-fee`} label={t('foodSelfFee')}>
          <Input id={`${id}-fee`} inputMode="decimal" value={f.fee} onChange={set('fee')} />
        </Field>
        <Field id={`${id}-min`} label={t('foodMinOrder')}>
          <Input id={`${id}-min`} inputMode="decimal" value={f.min} onChange={set('min')} />
        </Field>
        <Field id={`${id}-prep`} label={t('foodPrep')}>
          <Input id={`${id}-prep`} inputMode="numeric" value={f.prep} onChange={set('prep')} />
        </Field>
        <div className="flex items-end">
          <Button type="submit" disabled={pending}>
            {t('save')}
          </Button>
        </div>
      </form>
      <FormError id={`${id}-error`} message={error} />
    </div>
  );
}

/** Uploads a photo (dish) or the cover (no itemId). */
export function FoodImageUpload({
  restaurantId,
  itemId,
  label,
}: {
  restaurantId: string;
  itemId?: string;
  label: string;
}) {
  const id = useId();
  const { pending, error, run } = useAction();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="cursor-pointer text-xs text-primary underline">
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        disabled={pending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const form = new FormData();
          form.append('file', file);
          const path = itemId
            ? `/admin/restaurants/${restaurantId}/menu/items/${itemId}/image`
            : `/admin/restaurants/${restaurantId}/cover`;
          void run(() => apiClient(path, { method: 'POST', formData: form }));
          e.target.value = '';
        }}
      />
      <FormError id={`${id}-error`} message={error} />
    </div>
  );
}

/** Menu editor: categories, dishes (price, fiscal codes, photo, archive). */
export function MenuEditor({ restaurant }: { restaurant: AdminRestaurant }) {
  const t = useTranslations('admin');
  const locale = useLocale() as Locale;
  const id = useId();
  const base = `/admin/restaurants/${restaurant.id}/menu`;
  const { pending, error, setError, run } = useAction();
  const [cat, setCat] = useState({ uz: '', ru: '' });
  const [item, setItem] = useState({
    categoryId: restaurant.menu[0]?.id ?? '',
    uz: '',
    ru: '',
    price: '',
    mxik: '',
    pkg: '',
  });
  const setI = (key: keyof typeof item) => (e: { target: { value: string } }) => {
    setItem((v) => ({ ...v, [key]: e.target.value }));
  };

  return (
    <div className="flex flex-col gap-6">
      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () =>
              apiClient(`${base}/categories`, {
                method: 'POST',
                body: { name: { uz: cat.uz.trim(), ru: cat.ru.trim() } },
              }),
            () => {
              setCat({ uz: '', ru: '' });
            },
          );
        }}
      >
        <Field id={`${id}-cuz`} label={t('foodCategoryUz')}>
          <Input
            id={`${id}-cuz`}
            value={cat.uz}
            maxLength={60}
            onChange={(e) => {
              setCat((v) => ({ ...v, uz: e.target.value }));
            }}
          />
        </Field>
        <Field id={`${id}-cru`} label={t('foodCategoryRu')}>
          <Input
            id={`${id}-cru`}
            value={cat.ru}
            maxLength={60}
            onChange={(e) => {
              setCat((v) => ({ ...v, ru: e.target.value }));
            }}
          />
        </Field>
        <Button type="submit" disabled={pending || !cat.uz.trim() || !cat.ru.trim()}>
          {t('foodAddCategory')}
        </Button>
      </form>

      {restaurant.menu.length > 0 ? (
        <form
          className="grid gap-3 sm:grid-cols-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const price = parseSomInput(item.price);
            // The first category may have been added after this form mounted.
            const categoryId = item.categoryId || restaurant.menu[0]?.id || '';
            if (!price || price === '0') {
              setError(t('foodCheckFields'));
              return;
            }
            void run(
              () =>
                apiClient(`${base}/items`, {
                  method: 'POST',
                  body: {
                    categoryId,
                    name: { uz: item.uz.trim(), ru: item.ru.trim() },
                    priceTiyin: price,
                    ...(item.mxik.trim() ? { mxikCode: item.mxik.trim() } : {}),
                    ...(item.pkg.trim() ? { packageCode: item.pkg.trim() } : {}),
                  },
                }),
              () => {
                setItem((v) => ({ ...v, uz: '', ru: '', price: '' }));
              },
            );
          }}
          data-testid="dish-form"
        >
          <Field id={`${id}-icat`} label={t('foodCategory')}>
            <NativeSelect
              id={`${id}-icat`}
              value={item.categoryId || restaurant.menu[0]?.id}
              onChange={setI('categoryId')}
            >
              {restaurant.menu.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name[locale]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id={`${id}-iuz`} label={t('foodDishUz')}>
            <Input id={`${id}-iuz`} value={item.uz} maxLength={100} onChange={setI('uz')} />
          </Field>
          <Field id={`${id}-iru`} label={t('foodDishRu')}>
            <Input id={`${id}-iru`} value={item.ru} maxLength={100} onChange={setI('ru')} />
          </Field>
          <Field id={`${id}-iprice`} label={t('foodPrice')}>
            <Input
              id={`${id}-iprice`}
              inputMode="decimal"
              value={item.price}
              onChange={setI('price')}
            />
          </Field>
          <Field id={`${id}-imxik`} label={t('foodMxik')}>
            <Input
              id={`${id}-imxik`}
              inputMode="numeric"
              maxLength={17}
              value={item.mxik}
              onChange={setI('mxik')}
            />
          </Field>
          <Field id={`${id}-ipkg`} label={t('foodPackage')}>
            <Input
              id={`${id}-ipkg`}
              inputMode="numeric"
              maxLength={20}
              value={item.pkg}
              onChange={setI('pkg')}
            />
          </Field>
          <Button
            type="submit"
            className="self-end"
            disabled={pending || !item.uz.trim() || !item.ru.trim() || !item.price.trim()}
          >
            {t('foodAddDish')}
          </Button>
        </form>
      ) : null}
      <FormError id={`${id}-error`} message={error} />

      {restaurant.menu.map((category) => (
        <section key={category.id} aria-label={category.name[locale]}>
          <h3 className="mb-2 font-semibold">{category.name[locale]}</h3>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {category.items.map((dish) => (
              <li
                key={dish.id}
                className="flex flex-wrap items-center gap-3 p-3 text-sm"
                data-testid="admin-dish"
              >
                {dish.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- object storage URLs
                  <img src={dish.image} alt="" className="size-12 rounded object-cover" />
                ) : null}
                <span
                  className={dish.archived ? 'flex-1 text-muted-foreground line-through' : 'flex-1'}
                >
                  {dish.name[locale]}
                </span>
                <span className="tabular-nums">{somInputValue(dish.priceTiyin)}</span>
                <FoodImageUpload
                  restaurantId={restaurant.id}
                  itemId={dish.id}
                  label={t('foodPhoto')}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    void run(() =>
                      apiClient(`${base}/items/${dish.id}`, {
                        method: 'PATCH',
                        body: { archived: !dish.archived },
                      }),
                    )
                  }
                >
                  {dish.archived ? t('foodRestore') : t('foodArchive')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Add a courier (existing account). */
export function CourierCreateForm() {
  const t = useTranslations('admin');
  const id = useId();
  const { pending, error, run } = useAction();
  const [phone, setPhone] = useState('');
  const [vehicle, setVehicle] = useState('SCOOTER');
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          () => apiClient('/admin/couriers', { method: 'POST', body: { phone, vehicle } }),
          () => {
            setPhone('');
          },
        );
      }}
    >
      <Field id={`${id}-phone`} label={t('courierPhone')} hint={t('foodOwnerHint')}>
        <Input
          id={`${id}-phone`}
          type="tel"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
          }}
        />
      </Field>
      <Field id={`${id}-vehicle`} label={t('courierVehicle')}>
        <NativeSelect
          id={`${id}-vehicle`}
          value={vehicle}
          onChange={(e) => {
            setVehicle(e.target.value);
          }}
        >
          {['FOOT', 'BICYCLE', 'SCOOTER', 'CAR'].map((v) => (
            <option key={v} value={v}>
              {t(`vehicle_${v}`)}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Button type="submit" disabled={pending || phone.trim().length < 7}>
        {t('courierAdd')}
      </Button>
      <FormError id={`${id}-error`} message={error} />
    </form>
  );
}

/** Suspend/activate and settle cash for one courier. */
export function CourierActions({
  userId,
  status,
  balanceTiyin,
}: {
  userId: string;
  status: 'ACTIVE' | 'SUSPENDED';
  balanceTiyin: string;
}) {
  const t = useTranslations('admin');
  const id = useId();
  const { pending, error, setError, run } = useAction();
  const [amount, setAmount] = useState('');
  const balance = BigInt(balanceTiyin);

  const settle = (sign: 1n | -1n) => {
    const tiyin = parseSomInput(amount);
    if (!tiyin || tiyin === '0') {
      setError(t('foodCheckFields'));
      return;
    }
    void run(
      () =>
        apiClient(`/admin/couriers/${userId}/settlements`, {
          method: 'POST',
          body: { amountTiyin: (BigInt(tiyin) * sign).toString() },
        }),
      () => {
        setAmount('');
      },
    );
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          void run(() =>
            apiClient(`/admin/couriers/${userId}`, {
              method: 'PATCH',
              body: { status: status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' },
            }),
          )
        }
      >
        {status === 'ACTIVE' ? t('foodSuspend') : t('foodActivate')}
      </Button>
      {balance !== 0n ? (
        <>
          <label htmlFor={`${id}-amount`} className="sr-only">
            {t('courierAmount')}
          </label>
          <Input
            id={`${id}-amount`}
            className="w-32"
            inputMode="decimal"
            placeholder={somInputValue((balance < 0n ? -balance : balance).toString())}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
            }}
          />
          {balance < 0n ? (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => {
                settle(-1n);
              }}
            >
              {t('courierCashIn')}
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => {
                settle(1n);
              }}
            >
              {t('courierPayout')}
            </Button>
          )}
        </>
      ) : null}
      <FormError id={`${id}-error`} message={error} />
    </div>
  );
}
