create table public.wms_write_reservations (
  request_id text primary key,
  action text not null,
  user_id text not null,
  operation_id text not null unique,
  counter_keys text[] not null default '{}',
  counters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.wms_write_reservations enable row level security;
revoke all on public.wms_write_reservations from anon, authenticated;
grant all on public.wms_write_reservations to service_role;

create or replace function public.wms_reserve_write(
  p_request_id text,
  p_action text,
  p_user_id text,
  p_counter_keys text[] default '{}'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.request_log%rowtype;
  v_reservation public.wms_write_reservations%rowtype;
  v_date text := to_char(timezone('Asia/Bangkok', now()), 'YYYYMMDD');
  v_op_key text;
  v_key text;
  v_value bigint;
  v_op_number bigint;
  v_operation_id text;
  v_keys text[];
  v_counters jsonb := '{}'::jsonb;
begin
  if coalesce(p_request_id, '') = '' or coalesce(p_action, '') = '' or coalesce(p_user_id, '') = '' then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  if cardinality(coalesce(p_counter_keys, '{}')) > 20 then
    raise exception using errcode = '22023', message = 'TOO_MANY_COUNTERS';
  end if;
  perform pg_advisory_xact_lock(193710, 1);

  select * into v_request from public.request_log where request_id = p_request_id;
  if found then
    if v_request.user_id <> p_user_id or v_request.action <> p_action then
      raise exception using errcode = '22023', message = 'REQUEST_CONFLICT';
    end if;
    return jsonb_build_object('replay', true, 'data', coalesce(v_request.result_json, '{}'::jsonb));
  end if;

  select * into v_reservation from public.wms_write_reservations where request_id = p_request_id;
  v_keys := array(select distinct x from unnest(coalesce(p_counter_keys, '{}')) x where x <> '' order by x);
  if found then
    if v_reservation.user_id <> p_user_id or v_reservation.action <> p_action
       or v_reservation.counter_keys <> v_keys then
      raise exception using errcode = '22023', message = 'REQUEST_CONFLICT';
    end if;
    return jsonb_build_object('replay', false, 'operationId', v_reservation.operation_id,
      'counters', v_reservation.counters);
  end if;

  v_op_key := 'OP-' || v_date;
  insert into public.document_counters(counter_key, last_value, updated_at)
  values (v_op_key, 1, now())
  on conflict (counter_key) do update set last_value = public.document_counters.last_value + 1, updated_at = now()
  returning last_value into v_op_number;
  v_operation_id := v_op_key || '-' || lpad(v_op_number::text, 5, '0');
  v_counters := jsonb_set(v_counters, array[v_op_key], to_jsonb(v_op_number), true);

  foreach v_key in array v_keys loop
    insert into public.document_counters(counter_key, last_value, updated_at)
    values (v_key, 1, now())
    on conflict (counter_key) do update set last_value = public.document_counters.last_value + 1, updated_at = now()
    returning last_value into v_value;
    v_counters := jsonb_set(v_counters, array[v_key], to_jsonb(v_value), true);
  end loop;

  insert into public.wms_write_reservations(request_id, action, user_id, operation_id, counter_keys, counters)
  values (p_request_id, p_action, p_user_id, v_operation_id, v_keys, v_counters);
  return jsonb_build_object('replay', false, 'operationId', v_operation_id, 'counters', v_counters);
end;
$$;

create or replace function public.wms_commit_write_plan(
  p_request_id text,
  p_action text,
  p_user_id text,
  p_operation_id text,
  p_event_at timestamptz,
  p_appends jsonb,
  p_upserts jsonb,
  p_moves jsonb,
  p_result jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.request_log%rowtype;
  v_reservation public.wms_write_reservations%rowtype;
  v_group jsonb;
  v_row jsonb;
  v_move jsonb;
  v_upsert jsonb;
  v_table text;
  v_key text;
  v_key_col text;
  v_column_list text;
  v_update_list text;
  v_columns text[];
  v_sql text;
  v_sku text;
  v_status text;
  v_delta numeric;
  v_available numeric;
  v_inspection numeric;
  v_balance numeric;
  v_tx_seq integer := 0;
  v_result jsonb := coalesce(p_result, '{}'::jsonb);
  v_lines jsonb := '[]'::jsonb;
  v_line jsonb;
  v_count integer;
  v_now timestamptz := coalesce(p_event_at, now());
begin
  if coalesce(p_request_id, '') = '' or coalesce(p_action, '') = '' or coalesce(p_user_id, '') = '' then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  perform pg_advisory_xact_lock(193710, 1);

  select * into v_request from public.request_log where request_id = p_request_id;
  if found then
    if v_request.user_id <> p_user_id or v_request.action <> p_action then
      raise exception using errcode = '22023', message = 'REQUEST_CONFLICT';
    end if;
    return jsonb_build_object('replay', true, 'data', coalesce(v_request.result_json, '{}'::jsonb));
  end if;

  select * into v_reservation from public.wms_write_reservations where request_id = p_request_id;
  if not found or v_reservation.action <> p_action or v_reservation.user_id <> p_user_id
     or v_reservation.operation_id <> p_operation_id then
    raise exception using errcode = '22023', message = 'WRITE_RESERVATION_MISSING';
  end if;

  insert into public.stock_operations(operation_id, request_id, action, status, user_id, created_at, committed_at, plan_json, error)
  values (p_operation_id, p_request_id, p_action, 'PENDING', p_user_id, v_now, null,
    jsonb_build_object('appends', coalesce(p_appends, '[]'::jsonb), 'upserts', coalesce(p_upserts, '[]'::jsonb), 'moves', coalesce(p_moves, '[]'::jsonb)), null);

  for v_move in select value from jsonb_array_elements(coalesce(p_moves, '[]'::jsonb)) loop
    v_sku := upper(trim(v_move->>'sku'));
    v_status := coalesce(v_move->>'stock_status', 'AVAILABLE');
    v_delta := (v_move->>'delta')::numeric;
    if v_sku = '' or v_delta = 0 or v_status not in ('AVAILABLE', 'INSPECTION') then
      raise exception using errcode = '22023', message = 'INVALID_STOCK_MOVEMENT';
    end if;
    insert into public.stock_balance(sku, available_qty, inspection_qty, total_qty, updated_at, last_operation_id)
    values (v_sku, 0, 0, 0, v_now, p_operation_id) on conflict (sku) do nothing;
    select available_qty, inspection_qty into v_available, v_inspection
      from public.stock_balance where sku = v_sku for update;
    if v_status = 'AVAILABLE' then
      v_balance := v_available + v_delta;
      if v_balance < 0 then raise exception using errcode = 'P0001', message = 'INSUFFICIENT_STOCK', detail = v_sku; end if;
      v_available := v_balance;
    else
      v_balance := v_inspection + v_delta;
      if v_balance < 0 then raise exception using errcode = 'P0001', message = 'INSUFFICIENT_STOCK', detail = v_sku; end if;
      v_inspection := v_balance;
    end if;
    update public.stock_balance set available_qty = v_available, inspection_qty = v_inspection,
      total_qty = v_available + v_inspection, updated_at = v_now, last_operation_id = p_operation_id where sku = v_sku;
    v_tx_seq := v_tx_seq + 1;
    insert into public.wms_transactions(transaction_id, operation_id, transaction_type, sub_type, reference_id, channel_id,
      sku, product_name, quantity_change, stock_status, balance_after, reason, note, user_id, user_name, event_at)
    values (p_operation_id || '-' || lpad(v_tx_seq::text, 3, '0'), p_operation_id, v_move->>'transaction_type',
      coalesce(v_move->>'sub_type', ''), coalesce(v_move->>'reference_id', ''), nullif(v_move->>'channel_id', ''),
      v_sku, coalesce(v_move->>'product_name', ''), v_delta, v_status, v_balance,
      coalesce(v_move->>'reason', ''), coalesce(v_move->>'note', ''), p_user_id,
      coalesce(v_move->>'user_name', ''), v_now);
  end loop;

  for v_group in select value from jsonb_array_elements(coalesce(p_appends, '[]'::jsonb)) loop
    v_table := v_group->>'table';
    if v_table not in ('orders','order_items','wms_returns','sales_bills','sales_bill_items','fin_orders','wms_audit_log') then
      raise exception using errcode = '22023', message = 'APPEND_TABLE_NOT_ALLOWED', detail = coalesce(v_table, '');
    end if;
    if jsonb_typeof(v_group->'rows') <> 'array' then raise exception using errcode = '22023', message = 'INVALID_APPEND_ROWS'; end if;
    v_sql := format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)', v_table, v_table);
    execute v_sql using v_group->'rows';
  end loop;

  for v_upsert in select value from jsonb_array_elements(coalesce(p_upserts, '[]'::jsonb)) loop
    v_table := v_upsert->>'table';
    v_key_col := v_upsert->>'keyColumn';
    v_row := v_upsert->'row';
    v_key := case v_table
      when 'products' then 'sku' when 'prices' then 'sku' when 'fin_costs' then 'sku'
      when 'channels' then 'channel_id' when 'wms_users' then 'line_user_id' when 'orders' then 'internal_order_id'
      when 'order_items' then 'order_item_id' when 'sales_bills' then 'internal_order_id'
      when 'sales_bill_items' then 'item_id' when 'fin_orders' then 'internal_order_id'
      when 'stock_balance' then 'sku' when 'wms_returns' then 'return_id' when 'wms_settings' then 'key'
      else null end;
    if v_key is null or v_key_col <> v_key then raise exception using errcode = '22023', message = 'UPSERT_TABLE_NOT_ALLOWED', detail = coalesce(v_table, ''); end if;
    select array_agg(column_name order by ordinal_position) into v_columns from information_schema.columns
      where table_schema = 'public' and table_name = v_table;
    select string_agg(format('%I', column_name), ', ' order by ordinal_position) into v_column_list
      from information_schema.columns where table_schema = 'public' and table_name = v_table;
    select string_agg(format('%1$I = excluded.%1$I', column_name), ', ' order by ordinal_position) into v_update_list
      from information_schema.columns where table_schema = 'public' and table_name = v_table and column_name <> v_key;
    v_sql := format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) on conflict (%I) do update set %s',
      v_table, v_column_list, v_column_list, v_table, v_key, v_update_list);
    execute v_sql using v_row;
  end loop;

  if jsonb_typeof(v_result->'lines') = 'array' then
    for v_line in select value from jsonb_array_elements(v_result->'lines') loop
      select available_qty, inspection_qty into v_available, v_inspection from public.stock_balance where sku = v_line->>'sku';
      if found then
        v_lines := v_lines || jsonb_build_array(v_line || jsonb_build_object('available', v_available, 'inspection', v_inspection));
      else
        v_lines := v_lines || jsonb_build_array(v_line);
      end if;
    end loop;
    v_result := jsonb_set(v_result, '{lines}', v_lines, true);
  end if;

  insert into public.request_log(request_id, action, user_id, status, operation_id, result_json, created_at)
  values (p_request_id, p_action, p_user_id, 'DONE', p_operation_id, v_result, v_now);
  update public.stock_operations set status = 'COMMITTED', committed_at = v_now, plan_json = '{}'::jsonb
    where operation_id = p_operation_id;
  delete from public.wms_write_reservations where request_id = p_request_id;
  return jsonb_build_object('replay', false, 'data', v_result);
end;
$$;

revoke all on function public.wms_reserve_write(text, text, text, text[]) from public, anon, authenticated;
revoke all on function public.wms_commit_write_plan(text, text, text, text, timestamptz, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.wms_reserve_write(text, text, text, text[]) to service_role;
grant execute on function public.wms_commit_write_plan(text, text, text, text, timestamptz, jsonb, jsonb, jsonb, jsonb) to service_role;
