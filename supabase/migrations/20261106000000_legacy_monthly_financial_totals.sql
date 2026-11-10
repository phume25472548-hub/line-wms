create table public.legacy_monthly_financial_totals (
  month_start date not null,
  summary_kind text not null check (summary_kind in ('income', 'expense')),
  category text not null,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  entry_count integer not null default 0 check (entry_count >= 0),
  source_name text not null,
  imported_at timestamptz not null default now(),
  primary key (month_start, summary_kind, category, source_name)
);

alter table public.legacy_monthly_financial_totals enable row level security;
revoke all on public.legacy_monthly_financial_totals from anon, authenticated;
grant all on public.legacy_monthly_financial_totals to service_role;
