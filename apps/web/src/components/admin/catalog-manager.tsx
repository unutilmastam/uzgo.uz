'use client';

import type { AdminAttribute, AdminCategory } from '@uzgo/contracts';
import { Badge } from '@uzgo/ui/components/badge';
import { Button } from '@uzgo/ui/components/button';
import { Input } from '@uzgo/ui/components/input';
import { toast } from '@uzgo/ui/components/toast';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useMemo, useState } from 'react';
import { Field, FormError, NativeSelect } from '@/components/panel/form-controls';
import { useErrorMessage } from '@/components/panel/use-error-message';
import { useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { apiClient } from '@/lib/api-client';

type Row = AdminCategory & { depth: number };

const indented = (depth: number, name: string) => '— '.repeat(depth) + name;

/** Depth-first order so the flat list reads like a tree. */
function ordered(categories: AdminCategory[]): Row[] {
  const byParent = Map.groupBy(categories, (c) => c.parentId ?? 'root');
  const out: Row[] = [];
  const walk = (parent: string, depth: number) => {
    for (const c of byParent.get(parent) ?? []) {
      out.push({ ...c, depth });
      walk(c.id, depth + 1);
    }
  };
  walk('root', 0);
  return out;
}

function useMutation() {
  const t = useTranslations('admin');
  const errorMessage = useErrorMessage('admin');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setPending(true);
    setError(null);
    try {
      await action();
      toast.success(t('done'));
      router.refresh();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setPending(false);
    }
  };
  return { pending, error, run };
}

function CategoryForm({
  rows,
  category,
  onDone,
}: {
  rows: Row[];
  category?: AdminCategory;
  onDone?: () => void;
}) {
  const t = useTranslations('admin');
  const locale = useLocale() as Locale;
  const id = useId();
  const { pending, error, run } = useMutation();
  const [form, setForm] = useState({
    parentId: category?.parentId ?? '',
    slug: category?.slug ?? '',
    nameUz: category?.name.uz ?? '',
    nameRu: category?.name.ru ?? '',
    icon: category?.icon ?? '',
    sort: String(category?.sort ?? 0),
    commission:
      category?.commissionBp === null || category?.commissionBp === undefined
        ? ''
        : String(category.commissionBp / 100),
  });

  async function submit() {
    const body = {
      parentId: form.parentId || null,
      slug: form.slug.trim(),
      name: { uz: form.nameUz.trim(), ru: form.nameRu.trim() },
      icon: form.icon.trim() || null,
      sort: Number(form.sort) || 0,
    };
    // Percent → basis points with integer arithmetic ("12.5" → 1250); empty = inherit.
    const pct = form.commission.trim();
    const [whole = '0', frac = ''] = pct.split('.');
    const commissionBp = /^\d{1,2}(\.\d{1,2})?$/.test(pct)
      ? Number(whole) * 100 + Number(frac.padEnd(2, '0'))
      : null;
    const ok = await run(() =>
      category
        ? apiClient(`/admin/categories/${category.id}`, {
            method: 'PATCH',
            body: { ...body, commissionBp },
          })
        : apiClient('/admin/categories', { method: 'POST', body: { ...body, active: false } }),
    );
    if (ok) onDone?.();
  }

  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field id={`${id}-parent`} label={t('parent')}>
        <NativeSelect
          id={`${id}-parent`}
          value={form.parentId}
          onChange={(e) => {
            setForm({ ...form, parentId: e.target.value });
          }}
        >
          <option value="">{t('root')}</option>
          {rows
            .filter((r) => r.id !== category?.id)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {indented(r.depth, r.name[locale])}
              </option>
            ))}
        </NativeSelect>
      </Field>
      <Field id={`${id}-uz`} label={t('nameUz')}>
        <Input
          id={`${id}-uz`}
          value={form.nameUz}
          maxLength={80}
          onChange={(e) => {
            setForm({ ...form, nameUz: e.target.value });
          }}
        />
      </Field>
      <Field id={`${id}-ru`} label={t('nameRu')}>
        <Input
          id={`${id}-ru`}
          value={form.nameRu}
          maxLength={80}
          onChange={(e) => {
            setForm({ ...form, nameRu: e.target.value });
          }}
        />
      </Field>
      <Field id={`${id}-slug`} label={t('slug')}>
        <Input
          id={`${id}-slug`}
          value={form.slug}
          maxLength={60}
          autoCapitalize="none"
          spellCheck={false}
          onChange={(e) => {
            setForm({ ...form, slug: e.target.value.toLowerCase() });
          }}
        />
      </Field>
      <Field id={`${id}-icon`} label={t('icon')}>
        <Input
          id={`${id}-icon`}
          value={form.icon}
          maxLength={40}
          autoCapitalize="none"
          onChange={(e) => {
            setForm({ ...form, icon: e.target.value });
          }}
        />
      </Field>
      <Field id={`${id}-sort`} label={t('sort')}>
        <Input
          id={`${id}-sort`}
          type="number"
          min={0}
          value={form.sort}
          onChange={(e) => {
            setForm({ ...form, sort: e.target.value });
          }}
        />
      </Field>
      {category ? (
        <Field id={`${id}-commission`} label={t('commission')}>
          <Input
            id={`${id}-commission`}
            inputMode="decimal"
            value={form.commission}
            onChange={(e) => {
              setForm({ ...form, commission: e.target.value });
            }}
          />
        </Field>
      ) : null}
      <div className="flex flex-col gap-2 sm:col-span-3">
        <FormError id={`${id}-error`} message={error} />
        <Button type="submit" size="sm" className="w-fit" disabled={pending}>
          {category ? t('save') : t('create')}
        </Button>
      </div>
    </form>
  );
}

function CategoryRow({
  row,
  rows,
  attributes,
}: {
  row: Row;
  rows: Row[];
  attributes: AdminAttribute[];
}) {
  const t = useTranslations('admin');
  const locale = useLocale() as Locale;
  const { pending, error, run } = useMutation();
  const [editing, setEditing] = useState(false);

  const toggleFilter = (attributeId: string) => {
    const ids = row.attributeIds.includes(attributeId)
      ? row.attributeIds.filter((a) => a !== attributeId)
      : [...row.attributeIds, attributeId];
    void run(() =>
      apiClient(`/admin/categories/${row.id}/attributes`, {
        method: 'PUT',
        body: { attributeIds: ids },
      }),
    );
  };

  return (
    <li
      className="flex flex-col gap-3 p-4"
      style={{ paddingInlineStart: `${String(1 + row.depth * 1.5)}rem` }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{row.name[locale]}</span>
        <span className="font-mono text-xs text-muted-foreground">{row.slug}</span>
        <Badge variant={row.active ? 'accent' : 'muted'}>
          {row.active ? t('active') : t('inactive')}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {t('productCount', { count: row.productCount })}
        </span>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              void run(() =>
                apiClient(`/admin/categories/${row.id}`, {
                  method: 'PATCH',
                  body: { active: !row.active },
                }),
              )
            }
          >
            {row.active ? t('hide') : t('show')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={editing}
            onClick={() => {
              setEditing(!editing);
            }}
          >
            {t('edit')}
          </Button>
        </div>
      </div>
      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <legend className="sr-only">{t('filtersOf')}</legend>
        {attributes.map((attribute) => (
          <label key={attribute.id} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={row.attributeIds.includes(attribute.id)}
              disabled={pending}
              onChange={() => {
                toggleFilter(attribute.id);
              }}
            />
            {attribute.name[locale]}
          </label>
        ))}
      </fieldset>
      <FormError id={`${row.id}-error`} message={error} />
      {editing ? (
        <CategoryForm
          rows={rows}
          category={row}
          onDone={() => {
            setEditing(false);
          }}
        />
      ) : null}
    </li>
  );
}

function AttributePanel({ attribute }: { attribute: AdminAttribute }) {
  const t = useTranslations('admin');
  const locale = useLocale() as Locale;
  const id = useId();
  const { pending, error, run } = useMutation();
  const [value, setValue] = useState({ code: '', uz: '', ru: '' });

  async function add() {
    const ok = await run(() =>
      apiClient(`/admin/attributes/${attribute.id}/values`, {
        method: 'POST',
        body: { code: value.code.trim(), name: { uz: value.uz.trim(), ru: value.ru.trim() } },
      }),
    );
    if (ok) setValue({ code: '', uz: '', ru: '' });
  }

  return (
    <li className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{attribute.name[locale]}</span>
        <span className="font-mono text-xs text-muted-foreground">{attribute.code}</span>
      </div>
      <ul className="flex flex-wrap gap-1.5" aria-label={t('values')}>
        {attribute.values.map((v) => (
          <li key={v.id}>
            <Badge variant="secondary">{v.name[locale]}</Badge>
          </li>
        ))}
      </ul>
      <form
        className="grid gap-2 sm:grid-cols-[8rem_1fr_1fr_auto] sm:items-end"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <Field id={`${id}-code`} label={t('code')}>
          <Input
            id={`${id}-code`}
            value={value.code}
            maxLength={40}
            autoCapitalize="none"
            onChange={(e) => {
              setValue({ ...value, code: e.target.value.toLowerCase() });
            }}
          />
        </Field>
        <Field id={`${id}-uz`} label={t('nameUz')}>
          <Input
            id={`${id}-uz`}
            value={value.uz}
            maxLength={60}
            onChange={(e) => {
              setValue({ ...value, uz: e.target.value });
            }}
          />
        </Field>
        <Field id={`${id}-ru`} label={t('nameRu')}>
          <Input
            id={`${id}-ru`}
            value={value.ru}
            maxLength={60}
            onChange={(e) => {
              setValue({ ...value, ru: e.target.value });
            }}
          />
        </Field>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {t('addValue')}
        </Button>
      </form>
      <FormError id={`${id}-error`} message={error} />
    </li>
  );
}

function NewAttributeForm() {
  const t = useTranslations('admin');
  const id = useId();
  const { pending, error, run } = useMutation();
  const [form, setForm] = useState({ code: '', uz: '', ru: '' });
  return (
    <form
      className="grid gap-2 sm:grid-cols-[8rem_1fr_1fr_auto] sm:items-end"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void run(() =>
          apiClient('/admin/attributes', {
            method: 'POST',
            body: { code: form.code.trim(), name: { uz: form.uz.trim(), ru: form.ru.trim() } },
          }),
        ).then((ok) => {
          if (ok) setForm({ code: '', uz: '', ru: '' });
        });
      }}
    >
      <Field id={`${id}-code`} label={t('code')}>
        <Input
          id={`${id}-code`}
          value={form.code}
          maxLength={40}
          autoCapitalize="none"
          onChange={(e) => {
            setForm({ ...form, code: e.target.value.toLowerCase() });
          }}
        />
      </Field>
      <Field id={`${id}-uz`} label={t('nameUz')}>
        <Input
          id={`${id}-uz`}
          value={form.uz}
          maxLength={60}
          onChange={(e) => {
            setForm({ ...form, uz: e.target.value });
          }}
        />
      </Field>
      <Field id={`${id}-ru`} label={t('nameRu')}>
        <Input
          id={`${id}-ru`}
          value={form.ru}
          maxLength={60}
          onChange={(e) => {
            setForm({ ...form, ru: e.target.value });
          }}
        />
      </Field>
      <Button type="submit" size="sm" disabled={pending}>
        {t('create')}
      </Button>
      <div className="sm:col-span-4">
        <FormError id={`${id}-error`} message={error} />
      </div>
    </form>
  );
}

export function CatalogManager({
  categories,
  attributes,
}: {
  categories: AdminCategory[];
  attributes: AdminAttribute[];
}) {
  const t = useTranslations('admin');
  const rows = useMemo(() => ordered(categories), [categories]);
  const box = 'rounded-xl border border-border bg-card';
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="categories" className="flex flex-col gap-3">
        <h2 id="categories" className="text-lg font-semibold">
          {t('categories')}
        </h2>
        <div className={`${box} p-4`}>
          <h3 className="mb-3 text-sm font-semibold">{t('newCategory')}</h3>
          <CategoryForm rows={rows} />
        </div>
        <ul className={`${box} divide-y divide-border`}>
          {rows.map((row) => (
            <CategoryRow key={row.id} row={row} rows={rows} attributes={attributes} />
          ))}
        </ul>
      </section>
      <section aria-labelledby="attributes" className="flex flex-col gap-3">
        <h2 id="attributes" className="text-lg font-semibold">
          {t('attributes')}
        </h2>
        <div className={`${box} p-4`}>
          <h3 className="mb-3 text-sm font-semibold">{t('newAttribute')}</h3>
          <NewAttributeForm />
        </div>
        <ul className={`${box} divide-y divide-border`}>
          {attributes.map((attribute) => (
            <AttributePanel key={attribute.id} attribute={attribute} />
          ))}
        </ul>
      </section>
    </div>
  );
}
