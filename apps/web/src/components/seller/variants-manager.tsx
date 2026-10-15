'use client';

import type { SellerProduct, SellerVariant } from '@uzgo/contracts';
import { Badge } from '@uzgo/ui/components/badge';
import { Button } from '@uzgo/ui/components/button';
import { Input } from '@uzgo/ui/components/input';
import { toast } from '@uzgo/ui/components/toast';
import { formatPrice, parseSomInput, somInputValue } from '@uzgo/ui/lib/money';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Field, FormError, NativeSelect } from '@/components/panel/form-controls';
import { useErrorMessage } from '@/components/panel/use-error-message';
import { useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { apiClient } from '@/lib/api-client';
import { useCategoryAttributes } from './product-form';

type PriceFields = {
  price: string;
  oldPrice: string;
  stock: string;
  mxik: string;
  pkg: string;
  vat: string;
};

const emptyFields: PriceFields = {
  price: '',
  oldPrice: '',
  stock: '0',
  mxik: '',
  pkg: '',
  vat: '',
};

/** Converts the soʻm and fiscal inputs to API fields, or returns null when they are invalid. */
function toApi(fields: PriceFields) {
  const priceTiyin = parseSomInput(fields.price);
  const oldPrice = fields.oldPrice.trim() ? parseSomInput(fields.oldPrice) : null;
  const stock = Number(fields.stock);
  if (!priceTiyin || priceTiyin === '0' || (fields.oldPrice.trim() && !oldPrice)) return null;
  if (!Number.isInteger(stock) || stock < 0) return null;
  const mxik = fields.mxik.trim();
  const pkg = fields.pkg.trim();
  const vat = fields.vat.trim();
  if ((mxik && !/^\d{17}$/.test(mxik)) || (pkg && !/^\d{1,20}$/.test(pkg))) return null;
  if (vat && !/^\d{1,2}$/.test(vat)) return null;
  return {
    priceTiyin,
    compareAtPriceTiyin: oldPrice,
    stock,
    mxikCode: mxik || null,
    packageCode: pkg || null,
    vatRateBp: vat ? Number(vat) * 100 : null,
  };
}

/** IKPU, package code and VAT: needed for fiscal receipts of online payments. */
function FiscalFields({
  id,
  fields,
  disabled,
  onChange,
}: {
  id: string;
  fields: PriceFields;
  disabled?: boolean;
  onChange: (next: PriceFields) => void;
}) {
  const t = useTranslations('seller');
  return (
    <fieldset className="grid gap-3 sm:col-span-full sm:grid-cols-[1fr_1fr_6rem]">
      <legend className="mb-1 text-sm font-medium">{t('fiscalTitle')}</legend>
      <Field id={`${id}-mxik`} label={t('mxikCode')}>
        <Input
          id={`${id}-mxik`}
          inputMode="numeric"
          maxLength={17}
          disabled={disabled}
          value={fields.mxik}
          onChange={(e) => {
            onChange({ ...fields, mxik: e.target.value.replace(/\D/g, '') });
          }}
        />
      </Field>
      <Field id={`${id}-pkg`} label={t('packageCode')}>
        <Input
          id={`${id}-pkg`}
          inputMode="numeric"
          maxLength={20}
          disabled={disabled}
          value={fields.pkg}
          onChange={(e) => {
            onChange({ ...fields, pkg: e.target.value.replace(/\D/g, '') });
          }}
        />
      </Field>
      <Field id={`${id}-vat`} label={t('vatPercent')}>
        <Input
          id={`${id}-vat`}
          inputMode="numeric"
          maxLength={2}
          disabled={disabled}
          value={fields.vat}
          onChange={(e) => {
            onChange({ ...fields, vat: e.target.value.replace(/\D/g, '') });
          }}
        />
      </Field>
      <p className="text-xs text-muted-foreground sm:col-span-3">{t('fiscalHint')}</p>
    </fieldset>
  );
}

function VariantRow({
  storeId,
  productId,
  variant,
  readOnly,
}: {
  storeId: string;
  productId: string;
  variant: SellerVariant;
  readOnly: boolean;
}) {
  const t = useTranslations('seller');
  const locale = useLocale() as Locale;
  const errorMessage = useErrorMessage('seller');
  const router = useRouter();
  const id = useId();
  const [fields, setFields] = useState<PriceFields>({
    price: somInputValue(variant.priceTiyin),
    oldPrice: variant.compareAtPriceTiyin ? somInputValue(variant.compareAtPriceTiyin) : '',
    stock: String(variant.stock),
    mxik: variant.mxikCode ?? '',
    pkg: variant.packageCode ?? '',
    vat: variant.vatRateBp === null ? '' : String(variant.vatRateBp / 100),
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(extra: { active?: boolean } = {}) {
    const values = toApi(fields);
    if (!values) {
      setError(t('invalidPrice'));
      return;
    }
    setPending(true);
    setError(null);
    try {
      await apiClient(`/seller/stores/${storeId}/products/${productId}/variants/${variant.id}`, {
        method: 'PATCH',
        body: { ...values, ...extra },
      });
      toast.success(t('saved'));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const options = variant.options.map((o) => o.name[locale]).join(' · ');
  return (
    <li className="rounded-lg border border-border p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold">{variant.sku}</span>
        {options ? <span className="text-sm text-muted-foreground">{options}</span> : null}
        <Badge variant={variant.active ? 'accent' : 'muted'}>
          {variant.active ? t('active') : t('ps_ARCHIVED')}
        </Badge>
        <span className="ml-auto text-sm font-semibold tabular-nums">
          {formatPrice(variant.priceTiyin, locale)}
        </span>
      </div>
      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field id={`${id}-price`} label={t('price')}>
          <Input
            id={`${id}-price`}
            inputMode="decimal"
            disabled={readOnly}
            value={fields.price}
            onChange={(e) => {
              setFields({ ...fields, price: e.target.value });
            }}
          />
        </Field>
        <Field id={`${id}-old`} label={t('oldPrice')}>
          <Input
            id={`${id}-old`}
            inputMode="decimal"
            disabled={readOnly}
            value={fields.oldPrice}
            onChange={(e) => {
              setFields({ ...fields, oldPrice: e.target.value });
            }}
          />
        </Field>
        <Field id={`${id}-stock`} label={t('stock')}>
          <Input
            id={`${id}-stock`}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            disabled={readOnly}
            value={fields.stock}
            onChange={(e) => {
              setFields({ ...fields, stock: e.target.value });
            }}
          />
        </Field>
        <FiscalFields id={id} fields={fields} disabled={readOnly} onChange={setFields} />
        {readOnly ? null : (
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {t('save')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => void save({ active: !variant.active })}
            >
              {variant.active ? t('archive') : t('restore')}
            </Button>
          </div>
        )}
      </form>
      <div className="mt-2">
        <FormError id={`${id}-error`} message={error} />
      </div>
    </li>
  );
}

function AddVariantForm({ storeId, product }: { storeId: string; product: SellerProduct }) {
  const t = useTranslations('seller');
  const locale = useLocale() as Locale;
  const errorMessage = useErrorMessage('seller');
  const router = useRouter();
  const id = useId();
  const attributes = useCategoryAttributes(product.categoryId);
  const [sku, setSku] = useState('');
  const [fields, setFields] = useState<PriceFields>(emptyFields);
  const [options, setOptions] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const values = toApi(fields);
    if (!values) {
      setError(t('invalidPrice'));
      return;
    }
    setPending(true);
    setError(null);
    try {
      await apiClient(`/seller/stores/${storeId}/products/${product.id}/variants`, {
        method: 'POST',
        body: {
          sku: sku.trim(),
          ...values,
          optionValueIds: Object.values(options).filter(Boolean),
        },
      });
      setSku('');
      setFields(emptyFields);
      setOptions({});
      toast.success(t('saved'));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="grid gap-3 rounded-lg border border-dashed border-border p-4 sm:grid-cols-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h3 className="text-sm font-semibold sm:col-span-3">{t('addVariant')}</h3>
      <Field id={`${id}-sku`} label={t('sku')}>
        <Input
          id={`${id}-sku`}
          required
          maxLength={64}
          autoCapitalize="characters"
          spellCheck={false}
          value={sku}
          onChange={(e) => {
            setSku(e.target.value);
          }}
        />
      </Field>
      <Field id={`${id}-price`} label={t('price')}>
        <Input
          id={`${id}-price`}
          required
          inputMode="decimal"
          value={fields.price}
          onChange={(e) => {
            setFields({ ...fields, price: e.target.value });
          }}
        />
      </Field>
      <Field id={`${id}-old`} label={t('oldPrice')}>
        <Input
          id={`${id}-old`}
          inputMode="decimal"
          value={fields.oldPrice}
          onChange={(e) => {
            setFields({ ...fields, oldPrice: e.target.value });
          }}
        />
      </Field>
      <Field id={`${id}-stock`} label={t('stock')}>
        <Input
          id={`${id}-stock`}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={fields.stock}
          onChange={(e) => {
            setFields({ ...fields, stock: e.target.value });
          }}
        />
      </Field>
      {attributes.map((attribute) => (
        <Field key={attribute.id} id={`${id}-opt-${attribute.code}`} label={attribute.name[locale]}>
          <NativeSelect
            id={`${id}-opt-${attribute.code}`}
            value={options[attribute.id] ?? ''}
            onChange={(e) => {
              setOptions({ ...options, [attribute.id]: e.target.value });
            }}
          >
            <option value="">{t('notSet')}</option>
            {attribute.values.map((value) => (
              <option key={value.id} value={value.id}>
                {value.name[locale]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ))}
      <FiscalFields id={id} fields={fields} onChange={setFields} />
      <div className="flex flex-col gap-2 sm:col-span-3">
        <FormError id={`${id}-error`} message={error} />
        <Button type="submit" disabled={pending || !sku.trim()} className="w-fit">
          {t('addVariant')}
        </Button>
      </div>
    </form>
  );
}

export function VariantsManager({
  storeId,
  product,
  readOnly,
}: {
  storeId: string;
  product: SellerProduct;
  readOnly: boolean;
}) {
  const t = useTranslations('seller');
  return (
    <div className="flex flex-col gap-3">
      {product.variants.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noVariants')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {product.variants.map((variant) => (
            <VariantRow
              key={`${variant.id}-${variant.priceTiyin}-${String(variant.stock)}`}
              storeId={storeId}
              productId={product.id}
              variant={variant}
              readOnly={readOnly}
            />
          ))}
        </ul>
      )}
      {readOnly ? null : <AddVariantForm storeId={storeId} product={product} />}
    </div>
  );
}
