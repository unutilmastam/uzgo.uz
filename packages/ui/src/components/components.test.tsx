import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Badge } from './badge';
import { Button } from './button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './dialog';
import { EmptyState } from './empty-state';
import { Input } from './input';
import { Logo } from './logo';
import { Pagination, paginationRange } from './pagination';
import { ProductCard } from './product-card';
import { ServiceCard } from './service-card';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from './sheet';
import { Skeleton } from './skeleton';

// Testing Library normalises non-breaking spaces to plain spaces in text queries.

describe('Button', () => {
  it('renders a native button and handles clicks', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Saqlash</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('can render its child (e.g. a link) with button styles', () => {
    render(
      <Button asChild variant="outline">
        <a href="/uz">Bosh sahifa</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Bosh sahifa' });
    expect(link.className).toContain('border');
  });
});

describe('Input', () => {
  it('is labelled through a <label>', () => {
    render(
      <label>
        Telefon
        <Input name="phone" />
      </label>,
    );
    expect(screen.getByRole('textbox', { name: 'Telefon' })).toBeTruthy();
  });
});

describe('Logo', () => {
  it('exposes a single accessible name', () => {
    render(<Logo />);
    expect(screen.getByRole('img', { name: 'UZGO' })).toBeTruthy();
  });
});

describe('Badge, Skeleton, EmptyState', () => {
  it('renders badge text', () => {
    render(<Badge variant="sale">-25%</Badge>);
    expect(screen.getByText('-25%')).toBeTruthy();
  });

  it('hides skeletons from assistive tech', () => {
    const { container } = render(<Skeleton className="h-4" />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('announces empty and error states', () => {
    render(<EmptyState title="Savat boʻsh" description="Mahsulot qoʻshing" />);
    expect(screen.getByRole('status').textContent).toContain('Savat boʻsh');
    render(<EmptyState tone="error" title="Xatolik" />);
    expect(screen.getByRole('alert').textContent).toContain('Xatolik');
  });
});

describe('ProductCard', () => {
  const labels = { oldPrice: 'Eski narx', discount: (p: number) => `−${String(p)}%` };

  it('shows formatted price, discount and old price', () => {
    render(
      <ProductCard
        title="Choynak 1,7 l"
        price="27900000"
        oldPrice="37200000"
        locale="uz"
        storeName="Demo doʻkon"
        labels={labels}
      />,
    );
    expect(screen.getByRole('article')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Choynak 1,7 l' })).toBeTruthy();
    expect(screen.getByText('279 000 soʻm')).toBeTruthy();
    expect(screen.getByText('−25%')).toBeTruthy();
    expect(screen.getByText('Eski narx')).toBeTruthy();
  });

  it('omits the discount when there is none', () => {
    render(<ProductCard title="Kitob" price="5000000" locale="ru" labels={labels} />);
    expect(screen.getByText('50 000 сум')).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });
});

describe('ServiceCard', () => {
  it('is not interactive', () => {
    render(<ServiceCard icon={null} title="UZGO Go" description="Taksi" statusLabel="Tez kunda" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Tez kunda')).toBeTruthy();
  });
});

describe('Dialog and Sheet', () => {
  it('opens a labelled dialog with a translated close button', () => {
    render(
      <Dialog>
        <DialogTrigger>Ochish</DialogTrigger>
        <DialogContent closeLabel="Yopish">
          <DialogTitle>Hudud</DialogTitle>
          <DialogDescription>Hududni tanlang</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ochish' }));
    expect(screen.getByRole('dialog', { name: 'Hudud' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yopish' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens a sheet as a dialog', () => {
    render(
      <Sheet>
        <SheetTrigger>Katalog</SheetTrigger>
        <SheetContent closeLabel="Yopish" aria-describedby={undefined}>
          <SheetTitle>Kategoriyalar</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Katalog' }));
    expect(screen.getByRole('dialog', { name: 'Kategoriyalar' })).toBeTruthy();
  });
});

describe('Pagination', () => {
  it('computes ranges with gaps', () => {
    expect(paginationRange(1, 1)).toEqual([1]);
    expect(paginationRange(1, 5)).toEqual([1, 2, null, 5]);
    expect(paginationRange(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(paginationRange(10, 10)).toEqual([1, null, 9, 10]);
    expect(paginationRange(0, 0)).toEqual([]);
  });

  it('marks the current page and labels navigation', () => {
    render(
      <Pagination
        page={2}
        pageCount={3}
        hrefFor={(p) => `?page=${String(p)}`}
        labels={{
          nav: 'Sahifalar',
          previous: 'Oldingi',
          next: 'Keyingi',
          page: (p) => `${String(p)}-sahifa`,
        }}
      />,
    );
    expect(screen.getByRole('navigation', { name: 'Sahifalar' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '2-sahifa' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: 'Keyingi' }).getAttribute('href')).toBe('?page=3');
  });

  it('renders nothing for a single page', () => {
    const { container } = render(
      <Pagination
        page={1}
        pageCount={1}
        hrefFor={() => ''}
        labels={{ nav: '', previous: '', next: '', page: String }}
      />,
    );
    expect(container.innerHTML).toBe('');
  });
});
