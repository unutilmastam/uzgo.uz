import type { Variant } from '@uzgo/contracts';

export type OptionGroup = {
  attribute: string;
  name: { uz: string; ru: string };
  values: { code: string; name: { uz: string; ru: string } }[];
};

/** Attributes that distinguish the variants, with their values in first-seen order. */
export function optionGroups(variants: Variant[]): OptionGroup[] {
  const groups = new Map<string, OptionGroup>();
  for (const variant of variants) {
    for (const option of variant.options) {
      let group = groups.get(option.attribute);
      if (!group) {
        group = { attribute: option.attribute, name: option.attributeName, values: [] };
        groups.set(option.attribute, group);
      }
      if (!group.values.some((v) => v.code === option.code)) {
        group.values.push({ code: option.code, name: option.name });
      }
    }
  }
  return [...groups.values()];
}

export type Selection = Record<string, string>;

export function selectionOf(variant: Variant): Selection {
  return Object.fromEntries(variant.options.map((o) => [o.attribute, o.code]));
}

/** The variant matching every selected option, if any. */
export function findVariant(variants: Variant[], selection: Selection): Variant | undefined {
  return variants.find((variant) =>
    Object.entries(selection).every(([attribute, code]) =>
      variant.options.some((o) => o.attribute === attribute && o.code === code),
    ),
  );
}

/** Default choice: the first variant in stock (or the first one). */
export function defaultVariant(variants: Variant[]): Variant | undefined {
  return variants.find((v) => v.available > 0) ?? variants[0];
}

/** Changing one option: keep the others when that combination exists, else take any match. */
export function choose(
  variants: Variant[],
  selection: Selection,
  attribute: string,
  code: string,
): Selection {
  const wanted = { ...selection, [attribute]: code };
  const exact = findVariant(variants, wanted);
  if (exact) return selectionOf(exact);
  const partial = variants.find((v) =>
    v.options.some((o) => o.attribute === attribute && o.code === code),
  );
  return partial ? selectionOf(partial) : selection;
}
