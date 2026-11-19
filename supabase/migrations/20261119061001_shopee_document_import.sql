alter table public.orders add column if not exists tracking_number text;
create index if not exists orders_tracking_idx on public.orders(channel_id, tracking_number) where tracking_number is not null;

create table public.document_import_batches (
 id uuid primary key, channel_id text not null references public.channels(channel_id),
 created_by text not null, created_at timestamptz not null default now(),
 status text not null default 'REVIEW' check(status in ('REVIEW','COMMITTED')),
 rows_json jsonb not null, committed_at timestamptz, result_json jsonb
);
create table public.document_import_entries (
 id bigint generated always as identity primary key,
 batch_id uuid not null references public.document_import_batches(id),
 channel_id text not null references public.channels(channel_id),
 kind text not null check(kind in ('orders','income','adjustment')),
 entry_key text not null, external_order_id text not null, internal_order_id text references public.orders(internal_order_id),
 event_date date not null, amount numeric(14,2) not null, fee_amount numeric(14,2) not null default 0,
 tracking_number text, source_name text not null, source_hash text not null,
 unique(channel_id,kind,entry_key)
);
create index document_import_entries_date_idx on public.document_import_entries(event_date);
alter table public.document_import_batches enable row level security;
alter table public.document_import_entries enable row level security;
revoke all on public.document_import_batches,public.document_import_entries from public,anon,authenticated;
grant all on public.document_import_batches,public.document_import_entries to service_role;
grant usage,select on sequence public.document_import_entries_id_seq to service_role;

-- Only the authenticated Edge Function's service role can call this transaction.
create function public.wms_commit_document_import(p_batch uuid,p_user text,p_name text,p_choices jsonb)
returns jsonb language plpgsql set search_path=public as $$
declare b public.document_import_batches%rowtype; r jsonb; c jsonb; o public.orders%rowtype;
 matched_id text; cnt integer:=0; corrections integer:=0; res jsonb;
begin
 perform pg_advisory_xact_lock(193710,1);
 select * into b from public.document_import_batches where id=p_batch for update;
 if not found or b.created_by<>p_user then raise exception 'IMPORT_NOT_FOUND'; end if;
 if b.status='COMMITTED' then return b.result_json; end if;
 if jsonb_typeof(p_choices)<>'array' or jsonb_array_length(p_choices)=0 or jsonb_array_length(p_choices)>500 then raise exception 'EMPTY_SELECTION'; end if;
 if (select count(distinct x->>'index') from jsonb_array_elements(p_choices) x)<>jsonb_array_length(p_choices) then raise exception 'DUPLICATE_SELECTION'; end if;
 for c in select value from jsonb_array_elements(p_choices) loop
   r:=b.rows_json->((c->>'index')::int);
   if r is null or r->>'status' not in ('MATCHED','TRACKING_CANDIDATE','NOT_FOUND') then raise exception 'IMPORT_REVIEW_REQUIRED'; end if;
   if exists(select 1 from public.document_import_entries where channel_id=b.channel_id and kind=r->>'type' and entry_key=r->>'entryKey') then raise exception 'IMPORT_DUPLICATE'; end if;
   matched_id:=nullif(r->>'internalOrderId','');
   if matched_id is not null then
     select * into o from public.orders where internal_order_id=matched_id for update;
     if not found or o.channel_id<>b.channel_id or o.order_status='CANCELLED' then raise exception 'IMPORT_STALE'; end if;
     if o.external_order_id<>r->>'orderNo' then
       if r->>'status'<>'TRACKING_CANDIDATE' or not coalesce((c->>'correctNumber')::boolean,false) or o.external_order_id<>r->>'trackingNo' then raise exception 'IMPORT_STALE'; end if;
       if exists(select 1 from public.orders where channel_id=b.channel_id and external_order_id=r->>'orderNo' and internal_order_id<>matched_id and order_status<>'CANCELLED') then raise exception 'DUPLICATE_ORDER'; end if;
       update public.orders set external_order_id=r->>'orderNo',order_key=b.channel_id||'|'||(r->>'orderNo'),tracking_number=r->>'trackingNo' where internal_order_id=matched_id;
       update public.wms_returns set external_order_id=r->>'orderNo' where internal_order_id=matched_id;
       insert into public.wms_audit_log(log_id,event_at,user_id,user_name,action,target,details)
       values(gen_random_uuid()::text,now(),p_user,p_name,'ORDER_NUMBER_CORRECTED',matched_id,jsonb_build_object('before',o.external_order_id,'after',r->>'orderNo','tracking',r->>'trackingNo','batch',p_batch)::text);
       corrections:=corrections+1;
     elsif coalesce(r->>'trackingNo','')<>'' then
       if coalesce(o.tracking_number,'') not in ('',r->>'trackingNo') then raise exception 'TRACKING_CONFLICT'; end if;
       update public.orders set tracking_number=r->>'trackingNo' where internal_order_id=matched_id;
     end if;
     if exists(select 1 from public.fin_orders where internal_order_id=matched_id) then raise exception 'FINANCE_EXISTS'; end if;
   elsif not coalesce((c->>'historical')::boolean,false) then raise exception 'HISTORICAL_CONFIRM_REQUIRED';
   end if;
   if exists(select 1 from public.fin_orders f where f.channel_id=b.channel_id and f.external_order_id=r->>'orderNo') then raise exception 'FINANCE_EXISTS'; end if;
   if exists(select 1 from public.legacy_monthly_financial_totals where month_start=date_trunc('month',(r->>'date')::date)::date and summary_kind='income') then raise exception 'LEGACY_OVERLAP'; end if;
   insert into public.document_import_entries(batch_id,channel_id,kind,entry_key,external_order_id,internal_order_id,event_date,amount,fee_amount,tracking_number,source_name,source_hash)
   values(p_batch,b.channel_id,r->>'type',r->>'entryKey',r->>'orderNo',matched_id,(r->>'date')::date,(r->>'value')::numeric,(r->>'fees')::numeric,nullif(r->>'trackingNo',''),r->>'source',r->>'sourceHash');
   cnt:=cnt+1;
 end loop;
 res:=jsonb_build_object('batchId',p_batch,'count',cnt,'corrections',corrections);
 update public.document_import_batches set status='COMMITTED',committed_at=now(),result_json=res where id=p_batch;
 insert into public.wms_audit_log(log_id,event_at,user_id,user_name,action,target,details)
 values(gen_random_uuid()::text,now(),p_user,p_name,'DOCUMENT_IMPORT',p_batch::text,res::text);
 return res;
end $$;
revoke all on function public.wms_commit_document_import(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.wms_commit_document_import(uuid,text,text,jsonb) to service_role;

create function public.wms_guard_imported_finance() returns trigger language plpgsql set search_path=public as $$
begin
 perform pg_advisory_xact_lock(193710,1);
 if exists(select 1 from public.document_import_entries where channel_id=new.channel_id and (external_order_id=new.external_order_id or internal_order_id=new.internal_order_id)) then raise exception 'IMPORT_DUPLICATE'; end if;
 return new;
end $$;
revoke all on function public.wms_guard_imported_finance() from public,anon,authenticated;
create trigger guard_imported_finance before insert or update on public.fin_orders for each row execute function public.wms_guard_imported_finance();
